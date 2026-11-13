import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Banknote, Beer, Camera, CircleCheck, LayoutGrid, ScanBarcode, Search, Star, Utensils, X } from "lucide-react-native";
import { normaliserCodeBarres, trouverProduitParCode } from "@hotel-chicago/receipts";
import {
  articlesSelection,
  categoriesDuSegment,
  dejaPaye,
  filtrerProduits,
  libelleTotaux,
  LIBELLE_SEGMENT,
  limiteDisponible,
  nettoyerSelection,
  nomTableSuivante,
  partOuverte,
  peutTerminerTable,
  resteAPayer,
  totauxSelection,
  TOUTES_CATEGORIES,
  type SegmentVente,
} from "@hotel-chicago/regles";
import { Devise, peutOperer, StatutCompte, TypeProduit, type CompteCafeteria, type Produit } from "@hotel-chicago/types";
import { evaluerScan, raisonRefusAnnulationCompte, type DernierScan } from "@hotel-chicago/regles";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { heureCourte } from "../dates";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { EnteteMobile } from "../composants/EnteteMobile";
import { ScannerCodeBarres } from "../composants/ScannerCodeBarres";
import { SelecteurProduit } from "../composants/SelecteurProduit";
import { confirmerAction } from "../confirmer";
import { messageErreur } from "../messagesErreur";
import { annoncerStock, signalErreur, signalOk } from "../sons/sons";
import { CarteProduitVente } from "../vente/CarteProduitVente";
import { ONGLET_NOUVELLE_VENTE, useVente } from "../vente/ContexteVente";
import { FeuilleCreerTable, FeuillePanier, type LignePanier } from "../vente/FeuillesVente";
import { OngletsVentes, type OngletVente } from "../vente/OngletsVentes";
import { EcranCompteCafeteria } from "./EcranCompteCafeteria";

const SEGMENTS: SegmentVente[] = ["TOUT", "BOISSONS", "RESTAURANT"];
const ICONE_SEGMENT = { TOUT: LayoutGrid, BOISSONS: Beer, RESTAURANT: Utensils } as const;
const fmt = (m: number, d: "USD" | "CDF") => formatMontant(m, d === "USD" ? Devise.USD : Devise.CDF);

/** Ce que l'écran de compte doit faire en s'ouvrant : encaisser tout de suite (nouvelle vente) ou seulement montrer le détail. */
interface CompteOuvert {
  compteId: string;
  encaissement?: { cible: string; gardeOuvert?: boolean };
  /** Onglet à afficher quand on revient (la table du client resté, ou « Nouvelle vente »). */
  ongletApres: string;
}

/**
 * « Vente » (11/11/2026) : on arrive directement sur les produits. Le client choisit, puis soit il paie et part (Encaisser), soit il reste (on lui crée sa table
 * avec les produits déjà choisis, payés maintenant ou à la fin). Des onglets en haut passent de la nouvelle vente aux tables ouvertes.
 *
 * Offline first : le catalogue, les tables et toutes les écritures passent par la base locale (client = miroir) ; les paniers en cours sont gardés sur
 * l'appareil. Rien n'attend le réseau — la synchronisation se fait en arrière-plan. Le paiement et le reçu réutilisent l'écran de compte existant.
 */
export function EcranVente({ onRetour: _onRetour }: { onRetour: () => void }) {
  const { client, utilisateur, moteurSync } = useSession();
  const etatSync = useSyncEtat();
  const { width } = useWindowDimensions();
  const { onglet, choisirOnglet, selection: selectionDe, changer, vider, definir } = useVente();
  const operer = peutOperer(utilisateur);

  const [produits, setProduits] = useState<Produit[]>([]);
  const [populaires, setPopulaires] = useState<Map<string, number>>(new Map());
  const [comptes, setComptes] = useState<CompteCafeteria[] | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);

  const [segment, setSegment] = useState<SegmentVente>("TOUT");
  const [categorie, setCategorie] = useState(TOUTES_CATEGORIES);
  const [recherche, setRecherche] = useState("");

  const [panierOuvert, setPanierOuvert] = useState(false);
  const [tableOuverte, setTableOuverte] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [compteOuvert, setCompteOuvert] = useState<CompteOuvert | null>(null);

  // Scan : caméra, douchette (champ caché toujours focalisé, sans clavier virtuel), code inconnu à associer (comme l'ajout de consommations).
  const [scannerOuvert, setScannerOuvert] = useState(false);
  const [saisieDouchette, setSaisieDouchette] = useState("");
  const [infoScan, setInfoScan] = useState<string | null>(null);
  // Dernier article ajouté par un scan : le bandeau propose de l'annuler (« Annuler » retire UNE unité), sans ouvrir le panier.
  const [dernierScanne, setDernierScanne] = useState<Produit | null>(null);
  const [codeInconnu, setCodeInconnu] = useState<string | null>(null);
  const [selecteurAssociation, setSelecteurAssociation] = useState(false);
  const [codesAssocies, setCodesAssocies] = useState<Record<string, string>>({});
  const champDouchette = useRef<TextInput>(null);

  // Création d'une table en plusieurs écritures : mémorisée pour qu'un nouvel essai après une erreur ne crée jamais une seconde table.
  const creation = useRef<{ compteId: string; partId: string; suiteId?: string } | null>(null);

  // ------------------------------------------------------------------------------------------------ données (base locale)
  const charger = useCallback(async () => {
    try {
      const [prod, pop, liste] = await Promise.all([
        client.listerProduits(),
        client.produitsPopulaires().catch(() => []),
        client.listerComptesCafeteria(StatutCompte.OUVERT),
      ]);
      setProduits(prod);
      setPopulaires(new Map(pop.map((p) => [p.produitId, p.quantite])));
      setComptes(liste);
      setErreurChargement(null);
    } catch (e) {
      setErreurChargement(messageErreur(e, "Les produits n'ont pas pu être chargés."));
    }
  }, [client]);

  useFocusEffect(
    useCallback(() => {
      void charger();
      moteurSync.forcerSynchronisation();
    }, [charger, moteurSync])
  );
  useEffect(() => {
    if (etatSync.dernierePousseeLe) void charger();
  }, [etatSync.dernierePousseeLe, charger]);

  const produitsParId = useMemo(() => new Map(produits.map((p) => [p.id, p])), [produits]);

  // Les tables ouvertes qui ont leur onglet : celles du comptoir (les commandes du site restent dans « En cours »).
  const tables = useMemo(
    () => (comptes ?? []).filter((c) => c.origine !== "SITE_PUBLIC").sort((a, b) => a.ouvertLe.localeCompare(b.ouvertLe)),
    [comptes]
  );
  const tableActive = onglet === ONGLET_NOUVELLE_VENTE ? null : (tables.find((c) => c.id === onglet) ?? null);

  // Un onglet dont la table a été fermée ou annulée ailleurs : retour à la nouvelle vente.
  useEffect(() => {
    if (comptes && onglet !== ONGLET_NOUVELLE_VENTE && !tables.some((c) => c.id === onglet)) choisirOnglet(ONGLET_NOUVELLE_VENTE);
  }, [comptes, onglet, tables, choisirOnglet]);

  // Produits choisis qui n'existent plus au catalogue (supprimés ou désactivés depuis) : retirés sans bruit.
  const selection = selectionDe(onglet);
  useEffect(() => {
    if (produits.length === 0) return;
    const propre = nettoyerSelection(selection, new Map(produits.filter((p) => p.actif !== false).map((p) => [p.id, p])));
    if (propre !== selection) definir(onglet, propre);
  }, [produits, selection, onglet, definir]);

  const articles = articlesSelection(selection);
  const totaux = useMemo(() => totauxSelection(selection, produitsParId), [selection, produitsParId]);
  const libelleTotal = libelleTotaux(totaux, fmt);
  const lignesPanier = useMemo<LignePanier[]>(
    () => Object.entries(selection).flatMap(([id, quantite]) => (produitsParId.get(id) ? [{ produit: produitsParId.get(id)!, quantite }] : [])),
    [selection, produitsParId]
  );

  const onglets = useMemo<OngletVente[]>(() => {
    const n = articlesSelection(selectionDe(ONGLET_NOUVELLE_VENTE));
    const premier: OngletVente = { id: ONGLET_NOUVELLE_VENTE, titre: "Nouvelle vente", sousTitre: n > 0 ? `${n} article${n > 1 ? "s" : ""}` : "vide", nouvelle: true };
    return [
      premier,
      ...tables.map((c) => {
        const reste = resteAPayer(c);
        const paye = dejaPaye(c);
        return { id: c.id, titre: c.tableOuNom, sousTitre: reste.articles > 0 ? libelleTotaux(reste, fmt) : paye.articles > 0 ? "tout est payé" : "vide", paye: paye.articles > 0 };
      }),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, selectionDe]);

  // ------------------------------------------------------------------------------------------------ catalogue affiché
  const categories = useMemo(() => [TOUTES_CATEGORIES, ...categoriesDuSegment(produits, segment)], [produits, segment]);
  useEffect(() => {
    if (!categories.includes(categorie)) setCategorie(TOUTES_CATEGORIES);
  }, [categories, categorie]);
  const visibles = useMemo(() => filtrerProduits(produits, { segment, categorie, recherche, populaires }), [produits, segment, categorie, recherche, populaires]);
  const colonnes = width >= 900 ? 4 : width >= 600 ? 3 : 2;

  // ------------------------------------------------------------------------------------------------ scan (même comportement que l'ajout de consommations)
  useEffect(() => {
    if (!scannerOuvert && !selecteurAssociation && !panierOuvert && !tableOuverte && !compteOuvert) champDouchette.current?.focus();
  }, [scannerOuvert, selecteurAssociation, panierOuvert, tableOuverte, compteOuvert]);

  const dernierScan = useRef<DernierScan | null>(null);
  function ajouterParCode(brut: string): string {
    const code = normaliserCodeBarres(brut);
    if (!code) return "";
    // Anti-double-scan : le même code relu en moins de quelques secondes n'ajoute rien (le même article reste devant le lecteur).
    const verdictScan = evaluerScan(dernierScan.current, code, Date.now());
    dernierScan.current = verdictScan.suivant;
    if (!verdictScan.accepte) {
      if (!verdictScan.aSignaler) return "";
      const doublon = "Déjà scanné. Écartez l'article un instant, ou touchez « + » pour en ajouter un autre.";
      setInfoScan(doublon);
      return doublon;
    }
    const idAssocie = codesAssocies[code];
    const produit = (idAssocie && produitsParId.get(idAssocie)) || trouverProduitParCode(produits, code);
    if (!produit) {
      signalErreur();
      setCodeInconnu(code);
      const message = `Code ${code} inconnu`;
      setInfoScan(message);
      return message;
    }
    const limite = limiteDisponible(produit);
    const deja = selection[produit.id] ?? 0;
    if (limite !== null && deja + 1 > limite) {
      if (limite <= 0) annoncerStock(produit.nom, true);
      else signalErreur();
      const message = limite <= 0 ? `${produit.nom} : épuisé` : `${produit.nom} : plus que ${limite} en stock`;
      setInfoScan(message);
      return message;
    }
    changer(onglet, produit, 1);
    signalOk();
    setCodeInconnu(null);
    setDernierScanne(produit);
    const message = `${produit.nom} ajouté (${deja + 1})`;
    setInfoScan(message);
    return message;
  }

  async function associerCode(produit: Produit) {
    const code = codeInconnu;
    setSelecteurAssociation(false);
    if (!code) return;
    try {
      await client.associerCodeBarres(produit.id, code);
      setCodesAssocies((courant) => ({ ...courant, [code]: produit.id }));
      setCodeInconnu(null);
      changer(onglet, produit, 1);
      signalOk();
      setInfoScan(`Code associé à ${produit.nom} — ajouté.`);
    } catch (e) {
      setInfoScan(messageErreur(e, "Association impossible."));
    }
  }

  // ------------------------------------------------------------------------------------------------ actions (toutes écrites d'abord en local)
  /** Crée la table/le compte et y écrit les produits choisis. Chaque produit écrit sort de la sélection : un nouvel essai ne double rien. */
  async function creerCompteAvecLignes(nom: string, nomPremierePart: string, avecSuite: boolean): Promise<{ compteId: string; partId: string; suiteId?: string }> {
    if (!creation.current) {
      const compte = await client.ouvrirCompteCafeteria({ tableOuNom: nom, nomPremierSousCompte: nomPremierePart });
      creation.current = { compteId: compte.id, partId: compte.sousComptes[0].id };
    }
    const c = creation.current;
    for (const [produitId, quantite] of Object.entries(selectionDe(ONGLET_NOUVELLE_VENTE))) {
      await client.ajouterLigne(c.compteId, { sousCompteId: c.partId, produitId, quantite });
      const restante = { ...selectionDe(ONGLET_NOUVELLE_VENTE) };
      delete restante[produitId];
      definir(ONGLET_NOUVELLE_VENTE, restante);
    }
    if (avecSuite && !c.suiteId) {
      const suite = await client.ajouterSousCompte(c.compteId, "Suite");
      c.suiteId = suite.id;
    }
    return c;
  }

  /** Le client renonce : tout le panier est retiré d'un coup (après confirmation), sans ouvrir le panier ni retirer les produits un par un. */
  function viderLaVente() {
    confirmerAction({
      titre: "Vider la vente ?",
      message: `${articles} article${articles > 1 ? "s" : ""} (${libelleTotal}) seront retirés du panier.`,
      libelleConfirmer: "Vider",
      destructif: true,
      onConfirmer: () => {
        vider(ONGLET_NOUVELLE_VENTE);
        abandonnerCreation();
        setInfoScan(null);
        setCodeInconnu(null);
        setDernierScanne(null);
      },
    });
  }

  function abandonnerCreation() {
    creation.current = null;
  }

  /** Le client paie et part : compte « Comptoir », puis l'écran d'encaissement (espèces, Mobile Money, reçu). */
  async function encaisserEtPartir() {
    if (enCours || articles === 0) return;
    setEnCours(true);
    setErreur(null);
    try {
      const c = await creerCompteAvecLignes(`Comptoir ${heureCourte(new Date())}`, "Client", false);
      abandonnerCreation();
      vider(ONGLET_NOUVELLE_VENTE);
      setPanierOuvert(false);
      setCompteOuvert({ compteId: c.compteId, encaissement: { cible: "tout" }, ongletApres: ONGLET_NOUVELLE_VENTE });
    } catch (e) {
      setErreur(messageErreur(e, "La vente n'a pas pu être enregistrée. Réessayez : ce qui est déjà enregistré ne sera pas doublé."));
    } finally {
      setEnCours(false);
    }
  }

  /** Il reste : on crée sa table avec les produits déjà choisis, payés maintenant ou à la fin. */
  async function creerTable(choix: { nom: string; payerMaintenant: boolean }) {
    if (enCours || articles === 0) return;
    setEnCours(true);
    setErreur(null);
    try {
      const c = await creerCompteAvecLignes(choix.nom, choix.payerMaintenant ? "Première commande" : "Personne 1", choix.payerMaintenant);
      abandonnerCreation();
      vider(ONGLET_NOUVELLE_VENTE);
      setTableOuverte(false);
      setPanierOuvert(false);
      if (choix.payerMaintenant) {
        // La part « Première commande » est encaissée ; la table reste ouverte (part « Suite » vide) pour ce que le client prendra ensuite.
        setCompteOuvert({ compteId: c.compteId, encaissement: { cible: c.partId, gardeOuvert: true }, ongletApres: c.compteId });
      } else {
        await charger();
        choisirOnglet(c.compteId);
      }
    } catch (e) {
      setErreur(messageErreur(e, "La table n'a pas pu être créée. Réessayez : ce qui est déjà enregistré ne sera pas doublé."));
    } finally {
      setEnCours(false);
    }
  }

  /** Ajoute à la table les produits choisis (sur sa dernière part non payée ; une part « Suite » est créée si toutes sont payées). */
  async function ajouterALaTable(compte: CompteCafeteria): Promise<boolean> {
    const choisis = Object.entries(selectionDe(compte.id));
    if (choisis.length === 0) return true;
    setEnCours(true);
    setErreur(null);
    try {
      const part = partOuverte(compte) ?? (await client.ajouterSousCompte(compte.id, "Suite"));
      for (const [produitId, quantite] of choisis) {
        await client.ajouterLigne(compte.id, { sousCompteId: part.id, produitId, quantite });
        const restante = { ...selectionDe(compte.id) };
        delete restante[produitId];
        definir(compte.id, restante);
      }
      await charger();
      return true;
    } catch (e) {
      setErreur(messageErreur(e, "Les produits n'ont pas pu être ajoutés. Réessayez : ceux déjà enregistrés ne seront pas doublés."));
      return false;
    } finally {
      setEnCours(false);
    }
  }

  /** Encaisse ce qui reste sur la table (en ajoutant d'abord les produits choisis, s'il y en a). */
  async function encaisserLaTable(compte: CompteCafeteria) {
    if (enCours) return;
    if (!(await ajouterALaTable(compte))) return;
    setCompteOuvert({ compteId: compte.id, encaissement: { cible: "tout" }, ongletApres: ONGLET_NOUVELLE_VENTE });
  }

  function terminerLaTable(compte: CompteCafeteria) {
    confirmerAction({
      titre: `Terminer « ${compte.tableOuNom} » ?`,
      message: "Tout est payé : la table sera fermée et disparaîtra des ventes en cours.",
      libelleConfirmer: "Terminer la table",
      onConfirmer: async () => {
        try {
          await client.fermerCompteCafeteria(compte.id);
          await charger();
          choisirOnglet(ONGLET_NOUVELLE_VENTE);
        } catch (e) {
          setErreur(messageErreur(e, "La table n'a pas pu être terminée."));
        }
      },
    });
  }

  function annulerLaTable(compte: CompteCafeteria) {
    confirmerAction({
      titre: `Annuler « ${compte.tableOuNom} » ?`,
      message: "Cette table est vide : elle disparaît des ventes en cours.",
      libelleConfirmer: "Annuler la table",
      onConfirmer: async () => {
        try {
          await client.annulerCompteCafeteria(compte.id);
          await charger();
          choisirOnglet(ONGLET_NOUVELLE_VENTE);
        } catch (e) {
          setErreur(messageErreur(e, "La table n'a pas pu être annulée."));
        }
      },
    });
  }

  function retourDuCompte() {
    const apres = compteOuvert?.ongletApres ?? ONGLET_NOUVELLE_VENTE;
    setCompteOuvert(null);
    void charger().then(() => choisirOnglet(apres));
  }

  // ------------------------------------------------------------------------------------------------ rendu
  if (compteOuvert) {
    return (
      <EcranCompteCafeteria
        client={client}
        compteId={compteOuvert.compteId}
        encaissementAuDemarrage={compteOuvert.encaissement}
        onRetour={retourDuCompte}
      />
    );
  }

  const reste = tableActive ? resteAPayer(tableActive) : null;
  const paye = tableActive ? dejaPaye(tableActive) : null;
  const libelleReste = reste ? libelleTotaux(reste, fmt) : "";
  const annulable = !!tableActive && raisonRefusAnnulationCompte(tableActive) === null && (reste?.articles ?? 0) === 0 && articles === 0;

  return (
    <View style={styles.page}>
      <EnteteMobile />

      {/* Douchette (clavier Bluetooth/USB) : invisible, focalisée, sans clavier virtuel. */}
      <TextInput
        ref={champDouchette}
        style={styles.champCache}
        value={saisieDouchette}
        onChangeText={setSaisieDouchette}
        onSubmitEditing={() => {
          ajouterParCode(saisieDouchette);
          setSaisieDouchette("");
          champDouchette.current?.focus();
        }}
        showSoftInputOnFocus={false}
        autoFocus
        blurOnSubmit={false}
        autoCorrect={false}
        autoCapitalize="none"
        importantForAccessibility="no"
      />

      <OngletsVentes onglets={onglets} actif={onglet} onChoisir={choisirOnglet} />

      {tableActive && paye && paye.articles > 0 && (
        <View style={styles.dejaPaye}>
          <CircleCheck size={22} color={couleurs.succes} />
          <View style={{ flex: 1 }}>
            <Text style={styles.dejaPayeTitre}>
              Déjà payé : {paye.articles} article{paye.articles > 1 ? "s" : ""}
            </Text>
            <Text style={styles.dejaPayeSous}>{libelleTotaux(paye, fmt)}</Text>
          </View>
          <Pressable onPress={() => setCompteOuvert({ compteId: tableActive.id, ongletApres: tableActive.id })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voir le détail de la table">
            <Text style={styles.lien}>Détail</Text>
          </Pressable>
        </View>
      )}
      {tableActive && (!paye || paye.articles === 0) && (reste?.articles ?? 0) > 0 && (
        <View style={styles.bandeauTable}>
          <Text style={styles.bandeauTableTexte}>
            {tableActive.tableOuNom} · {reste!.articles} article{reste!.articles > 1 ? "s" : ""} · à payer {libelleReste}
          </Text>
          <Pressable onPress={() => setCompteOuvert({ compteId: tableActive.id, ongletApres: tableActive.id })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voir le détail de la table">
            <Text style={styles.lien}>Détail</Text>
          </Pressable>
        </View>
      )}
      {!operer && (
        <View style={styles.bandeauTable}>
          <Text style={styles.bandeauTableTexte}>Lecture seule : le patron consulte la caisse sans vendre.</Text>
        </View>
      )}

      <View style={styles.ligneRecherche}>
        <View style={styles.recherche}>
          <Search size={18} color={couleurs.encreFaible} />
          <TextInput
            style={styles.champ}
            value={recherche}
            onChangeText={setRecherche}
            // Une douchette qui écrit ici (champ focalisé) : code exact → ajout direct.
            onSubmitEditing={() => {
              if (trouverProduitParCode(produits, recherche) || codesAssocies[normaliserCodeBarres(recherche)]) {
                ajouterParCode(recherche);
                setRecherche("");
              }
            }}
            onBlur={() => {
              if (!scannerOuvert && !panierOuvert && !tableOuverte) champDouchette.current?.focus();
            }}
            accessibilityLabel="Rechercher un produit"
            placeholder="Rechercher un produit"
            placeholderTextColor={couleurs.encreFaible}
            autoCorrect={false}
            returnKeyType="search"
          />
          {recherche.length > 0 && (
            <Pressable onPress={() => setRecherche("")} hitSlop={14} style={styles.zoneTactile} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
              <X size={18} color={couleurs.encreAttenuee} />
            </Pressable>
          )}
        </View>
        {operer && (
          <Pressable style={styles.boutonScanner} onPress={() => setScannerOuvert(true)} accessibilityRole="button" accessibilityLabel="Scanner avec la caméra">
            <Camera size={20} color="#fff" />
          </Pressable>
        )}
      </View>

      {infoScan && (
        <View style={[styles.bandeauScan, codeInconnu ? styles.bandeauScanErreur : null]} accessibilityRole={codeInconnu ? "alert" : undefined} accessibilityLiveRegion="polite">
          <ScanBarcode size={16} color={codeInconnu ? couleurs.danger : couleurs.succes} />
          <Text style={styles.bandeauScanTexte} numberOfLines={2}>
            {infoScan}
          </Text>
          {codeInconnu && (
            <Pressable
              onPress={() => (etatSync.enLigne ? setSelecteurAssociation(true) : setInfoScan(`Code ${codeInconnu} inconnu — associez-le quand le réseau revient.`))}
              hitSlop={8}
              style={styles.zoneTactile}
              accessibilityRole="button"
              accessibilityLabel={`Associer le code ${codeInconnu} à un produit`}
            >
              <Text style={styles.lien}>Associer</Text>
            </Pressable>
          )}
          {dernierScanne && !codeInconnu && (selection[dernierScanne.id] ?? 0) > 0 && (
            <Pressable
              onPress={() => {
                changer(onglet, dernierScanne, -1);
                setInfoScan(`${dernierScanne.nom} retiré`);
                setDernierScanne(null);
              }}
              hitSlop={8}
              style={styles.zoneTactile}
              accessibilityRole="button"
              accessibilityLabel={`Annuler le dernier ajout : ${dernierScanne.nom}`}
            >
              <Text style={styles.lien}>Annuler</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              setInfoScan(null);
              setCodeInconnu(null);
              setDernierScanne(null);
            }}
            hitSlop={8}
            style={styles.zoneTactile}
            accessibilityRole="button"
            accessibilityLabel="Fermer le message"
          >
            <X size={16} color={couleurs.encreAttenuee} />
          </Pressable>
        </View>
      )}

      <View style={styles.segments} accessibilityRole="tablist">
        {SEGMENTS.map((s) => {
          const Icone = ICONE_SEGMENT[s];
          const actif = s === segment;
          return (
            <Pressable key={s} onPress={() => setSegment(s)} style={[styles.segment, actif && styles.segmentActif]} accessibilityRole="tab" accessibilityState={{ selected: actif }}>
              <Icone size={17} color={actif ? "#fff" : couleurs.encre} />
              <Text style={[styles.segmentTexte, actif && { color: "#fff" }]}>{LIBELLE_SEGMENT[s]}</Text>
            </Pressable>
          );
        })}
      </View>

      {categories.length > 2 && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.puces}>
            {categories.map((c) => {
              const actif = c === categorie;
              return (
                <Pressable key={c} onPress={() => setCategorie(c)} style={[styles.puce, actif && styles.puceActive]} accessibilityRole="button" accessibilityState={{ selected: actif }}>
                  {c === TOUTES_CATEGORIES && <Star size={13} color={actif ? couleurs.bleu : couleurs.encreAttenuee} />}
                  <Text style={[styles.puceTexte, actif && { color: couleurs.bleu }]}>{c === TOUTES_CATEGORIES ? "Populaires" : c}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {erreurChargement && (
        <Text style={styles.erreurBande} accessibilityRole="alert">
          {erreurChargement}
        </Text>
      )}
      {erreur && !panierOuvert && !tableOuverte && (
        <Text style={styles.erreurBande} accessibilityRole="alert">
          {erreur}
        </Text>
      )}

      <FlatList
        key={colonnes}
        data={visibles}
        keyExtractor={(p) => p.id}
        numColumns={colonnes}
        columnWrapperStyle={colonnes > 1 ? styles.rangee : undefined}
        contentContainerStyle={styles.liste}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.vide}>{comptes === null ? "Chargement…" : recherche ? "Aucun produit ne correspond à la recherche." : "Aucun produit disponible."}</Text>}
        renderItem={({ item }) => (
          <View style={{ flex: 1 / colonnes }}>
            <CarteProduitVente produit={item} quantite={selection[item.id] ?? 0} onChanger={(delta) => operer && changer(onglet, item, delta)} />
          </View>
        )}
      />

      {/* Barre du bas : suit le client partout. */}
      {operer && !tableActive && articles > 0 && (
        <BarreBas
          gauche={`Vente · ${articles} article${articles > 1 ? "s" : ""}`}
          fort={libelleTotal}
          actions={[
            { libelle: "Vider", onPress: viderLaVente },
            { libelle: "Voir le panier", principal: true, onPress: () => { setErreur(null); setPanierOuvert(true); } },
          ]}
        />
      )}
      {operer && tableActive && (articles > 0 || (reste?.articles ?? 0) > 0 || peutTerminerTable(tableActive) || annulable) && (
        <BarreBas
          gauche={articles > 0 ? `${tableActive.tableOuNom} · ${articles} à ajouter` : (reste?.articles ?? 0) > 0 ? `${tableActive.tableOuNom} · à payer` : tableActive.tableOuNom}
          fort={articles > 0 ? libelleTotal : (reste?.articles ?? 0) > 0 ? libelleReste : peutTerminerTable(tableActive) ? "Tout est payé" : "Table vide"}
          actions={[
            ...(articles > 0 ? [{ libelle: "Ajouter", occupe: enCours, onPress: () => void ajouterALaTable(tableActive) }] : []),
            ...((reste?.articles ?? 0) > 0 || articles > 0 ? [{ libelle: "Encaisser", principal: true, vert: true, onPress: () => void encaisserLaTable(tableActive) }] : []),
            ...(articles === 0 && (reste?.articles ?? 0) === 0 && peutTerminerTable(tableActive) ? [{ libelle: "Terminer la table", principal: true, onPress: () => terminerLaTable(tableActive) }] : []),
            ...(annulable ? [{ libelle: "Annuler la table", onPress: () => annulerLaTable(tableActive) }] : []),
          ]}
        />
      )}

      <FeuillePanier
        visible={panierOuvert}
        lignes={lignesPanier}
        totaux={totaux}
        totalLibelle={libelleTotal}
        onChanger={(produit, delta) => changer(ONGLET_NOUVELLE_VENTE, produit, delta)}
        onFermer={() => {
          if (!enCours) {
            setPanierOuvert(false);
            abandonnerCreation();
          }
        }}
        onEncaisser={() => void encaisserEtPartir()}
        onIlReste={() => {
          setErreur(null);
          setTableOuverte(true);
        }}
        enCours={enCours}
        erreur={erreur}
      />
      <FeuilleCreerTable
        visible={tableOuverte}
        nomInitial={nomTableSuivante(tables)}
        articles={articles}
        totalLibelle={libelleTotal}
        onFermer={() => {
          if (!enCours) setTableOuverte(false);
        }}
        onValider={(choix) => void creerTable(choix)}
        enCours={enCours}
        erreur={erreur}
      />

      <ScannerCodeBarres visible={scannerOuvert} mode="continu" onCode={ajouterParCode} onFermer={() => setScannerOuvert(false)} titre={tableActive ? `Scanner pour ${tableActive.tableOuNom}` : "Scanner pour la nouvelle vente"} />
      <SelecteurProduit
        visible={selecteurAssociation}
        produits={produits.filter((p) => p.typeProduit !== TypeProduit.PLAT && !p.codeBarres)}
        onChoisir={(p) => void associerCode(p)}
        onFermer={() => setSelecteurAssociation(false)}
      />
      {enCours && !panierOuvert && !tableOuverte && (
        <View style={styles.attente} pointerEvents="none">
          <ActivityIndicator color={couleurs.bleu} />
        </View>
      )}
    </View>
  );
}

interface ActionBarre {
  libelle: string;
  onPress: () => void;
  principal?: boolean;
  vert?: boolean;
  occupe?: boolean;
}

function BarreBas({ gauche, fort, actions }: { gauche: string; fort: string; actions: ActionBarre[] }) {
  return (
    <View style={styles.barre}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.barreGauche} numberOfLines={1}>
          {gauche}
        </Text>
        <Text style={styles.barreFort} numberOfLines={1}>
          {fort}
        </Text>
      </View>
      <View style={styles.barreActions}>
        {actions.map((a) => (
          <Pressable
            key={a.libelle}
            onPress={a.onPress}
            disabled={a.occupe}
            style={[styles.barreBouton, a.principal ? styles.barreBoutonPrincipal : styles.barreBoutonSecondaire]}
            accessibilityRole="button"
            accessibilityLabel={a.libelle}
            accessibilityState={{ busy: !!a.occupe }}
          >
            {a.vert && <Banknote size={18} color={couleurs.succes} />}
            <Text style={[styles.barreBoutonTexte, a.principal ? { color: a.vert ? couleurs.succes : couleurs.bleu } : { color: "#fff" }]}>{a.occupe ? "…" : a.libelle}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  champCache: { position: "absolute", width: 1, height: 1, opacity: 0, left: -10, top: -10 },
  ligneRecherche: { flexDirection: "row", alignItems: "center", gap: espacements.s2, marginHorizontal: espacements.s4 },
  recherche: { flex: 1, flexDirection: "row", alignItems: "center", gap: espacements.s2, paddingHorizontal: espacements.s3, minHeight: 46, borderRadius: rayons.md, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface200 },
  champ: { flex: 1, fontSize: 15, color: couleurs.encre, paddingVertical: 0 },
  zoneTactile: { minWidth: 32, minHeight: 32, alignItems: "center", justifyContent: "center" },
  boutonScanner: { width: 46, height: 46, borderRadius: rayons.md, backgroundColor: couleurs.navy, alignItems: "center", justifyContent: "center" },
  bandeauScan: { flexDirection: "row", alignItems: "center", gap: espacements.s2, marginHorizontal: espacements.s4, marginTop: espacements.s2, paddingHorizontal: espacements.s3, paddingVertical: espacements.s2, borderRadius: rayons.sm, backgroundColor: couleurs.succesClair },
  bandeauScanErreur: { backgroundColor: couleurs.dangerClair },
  bandeauScanTexte: { flex: 1, fontSize: 13, color: couleurs.encre },
  lien: { color: couleurs.bleu, fontWeight: "700", fontSize: 13 },
  segments: { flexDirection: "row", gap: 6, marginHorizontal: espacements.s4, marginTop: espacements.s3 },
  segment: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface200, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  segmentActif: { backgroundColor: couleurs.navy, borderColor: couleurs.navy },
  segmentTexte: { fontSize: 13.5, fontWeight: "700", color: couleurs.encre },
  puces: { paddingHorizontal: espacements.s4, paddingTop: espacements.s2, paddingBottom: espacements.s2, gap: 8 },
  puce: { height: 34, paddingHorizontal: 14, borderRadius: 17, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: couleurs.surface200, borderWidth: 1, borderColor: couleurs.bordure },
  puceActive: { backgroundColor: couleurs.bleuClair, borderColor: "#BBD6FB" },
  puceTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encreAttenuee },
  liste: { paddingHorizontal: espacements.s4, paddingTop: espacements.s1, paddingBottom: 110 },
  rangee: { gap: 10, marginBottom: 10 },
  vide: { textAlign: "center", color: couleurs.encreAttenuee, marginTop: espacements.s6 },
  erreurBande: { marginHorizontal: espacements.s4, marginTop: espacements.s2, color: couleurs.danger, fontSize: 13 },
  dejaPaye: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: espacements.s4, marginBottom: espacements.s3, padding: 10, borderRadius: rayons.md, backgroundColor: couleurs.succesClair, borderWidth: 1, borderColor: "#B7E4C7" },
  dejaPayeTitre: { fontSize: 13.5, fontWeight: "800", color: couleurs.succes },
  dejaPayeSous: { fontSize: 12, color: couleurs.encreAttenuee },
  bandeauTable: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espacements.s2, marginHorizontal: espacements.s4, marginBottom: espacements.s2, padding: 10, borderRadius: rayons.md, backgroundColor: couleurs.bleuClair },
  bandeauTableTexte: { flex: 1, fontSize: 13, fontWeight: "600", color: couleurs.encre },
  barre: { position: "absolute", left: 12, right: 12, bottom: 12, minHeight: 62, borderRadius: 18, backgroundColor: couleurs.bleu, flexDirection: "row", alignItems: "center", gap: espacements.s2, paddingLeft: 16, paddingRight: 10, paddingVertical: 8, shadowColor: couleurs.bleu, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  barreGauche: { fontSize: 12, color: "rgba(255,255,255,0.85)" },
  barreFort: { fontSize: 15.5, fontWeight: "800", color: "#fff" },
  barreActions: { flexDirection: "row", gap: 6, flexShrink: 0 },
  barreBouton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  barreBoutonPrincipal: { backgroundColor: "#fff" },
  barreBoutonSecondaire: { backgroundColor: "rgba(255,255,255,0.18)" },
  barreBoutonTexte: { fontWeight: "800", fontSize: 14 },
  attente: { position: "absolute", top: 8, alignSelf: "center" },
});
