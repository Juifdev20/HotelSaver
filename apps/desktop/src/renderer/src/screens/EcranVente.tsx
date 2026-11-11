import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Button, formatMontant, useTitrePage } from "@hotel-chicago/ui";
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
  raisonRefusAnnulationCompte,
  resteAPayer,
  totauxSelection,
  TOUTES_CATEGORIES,
  type SegmentVente,
} from "@hotel-chicago/regles";
import { Devise, peutOperer, StatutCompte, TypeProduit, type CompteCafeteria, type ProfilConnecte, type Produit } from "@hotel-chicago/types";
import { Banknote, Beer, Camera, LayoutGrid, ScanBarcode, Search, ShoppingCart, Star, Table2, Utensils, X, CircleCheck } from "lucide-react";
import { ScannerWebcam } from "../components/ScannerWebcam";
import { bip, useDouchette } from "../components/scan";
import { annoncerStock, bipSimple } from "../sons";
import { useConfirmation } from "../components/DialogueConfirmation";
import { CarteProduit } from "../vente/CarteProduit";
import { ONGLET_NOUVELLE_VENTE, useVente } from "../vente/ContexteVente";
import { DialogueCreerTable } from "../vente/DialogueCreerTable";
import { OngletsVentes, type OngletVente } from "../vente/OngletsVentes";
import { TicketVente, type ActionTicket, type LigneAjout, type LigneTable } from "../vente/TicketVente";
import { EcranCompteCafeteria } from "./EcranCompteCafeteria";
import type { SynchronisationEcran } from "../synchronisation-ecran";
import "../vente/vente.css";

const SEGMENTS: SegmentVente[] = ["TOUT", "BOISSONS", "RESTAURANT"];
const ICONE_SEGMENT = { TOUT: LayoutGrid, BOISSONS: Beer, RESTAURANT: Utensils } as const;
const fmt = (m: number, d: "USD" | "CDF") => formatMontant(m, d === "USD" ? Devise.USD : Devise.CDF);
const heureCourte = (d: Date) => {
  // Heure murale de Lubumbashi (UTC+2, sans heure d'été), quel que soit le fuseau du poste.
  const l = new Date(d.getTime() + 2 * 3_600_000);
  return `${String(l.getUTCHours()).padStart(2, "0")}:${String(l.getUTCMinutes()).padStart(2, "0")}`;
};

/** Ce que l'écran de compte doit faire en s'ouvrant : encaisser tout de suite (nouvelle vente) ou seulement montrer le détail. */
interface CompteOuvert {
  compteId: string;
  encaissement?: { cible: string; gardeOuvert?: boolean };
  /** Onglet à afficher quand on revient (la table du client resté, ou « Nouvelle vente »). */
  ongletApres: string;
}

export interface EcranVenteProps {
  client: ClientApi;
  utilisateur: ProfilConnecte;
  interfaceImprimante: string | null;
  synchronisation?: SynchronisationEcran;
}

function useEcranLarge(): boolean {
  const requete = "(min-width: 1180px)";
  const [large, setLarge] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(requete).matches : true));
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(requete);
    const surChangement = () => setLarge(m.matches);
    m.addEventListener("change", surChangement);
    return () => m.removeEventListener("change", surChangement);
  }, []);
  return large;
}

/**
 * « Vente » (11/11/2026) : on arrive directement sur les produits ; le ticket est à droite. Le client choisit, puis soit il paie et part (Encaisser), soit il reste
 * (on lui crée sa table avec les produits déjà choisis, payés maintenant ou à la fin). Des onglets en haut passent de la nouvelle vente aux tables ouvertes.
 *
 * Offline first : `client` est celui de la base locale (miroir) — catalogue, tables et écritures n'attendent jamais le réseau, la synchronisation se fait en
 * arrière-plan ; les paniers en cours sont gardés sur le poste. Le paiement et le reçu réutilisent l'écran de compte existant.
 */
export function EcranVente({ client, utilisateur, interfaceImprimante, synchronisation }: EcranVenteProps) {
  useTitrePage("Vente");
  const { onglet, choisirOnglet, selection: selectionDe, changer, vider, definir } = useVente();
  const operer = peutOperer(utilisateur);
  const large = useEcranLarge();
  const { demander, dialogue } = useConfirmation();

  const [produits, setProduits] = useState<Produit[]>([]);
  const [populaires, setPopulaires] = useState<Map<string, number>>(new Map());
  const [comptes, setComptes] = useState<CompteCafeteria[] | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);

  const [segment, setSegment] = useState<SegmentVente>("TOUT");
  const [categorie, setCategorie] = useState(TOUTES_CATEGORIES);
  const [recherche, setRecherche] = useState("");
  const champRecherche = useRef<HTMLInputElement>(null);

  const [ticketOuvert, setTicketOuvert] = useState(false);
  const [tableOuverte, setTableOuverte] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [compteOuvert, setCompteOuvert] = useState<CompteOuvert | null>(null);

  // Scan : douchette (écoute du clavier), webcam, code inconnu à associer.
  const [webcamOuverte, setWebcamOuverte] = useState(false);
  const [infoScan, setInfoScan] = useState<string | null>(null);
  const [codeInconnu, setCodeInconnu] = useState<string | null>(null);
  const [produitAssocie, setProduitAssocie] = useState("");
  const [codesAssocies, setCodesAssocies] = useState<Record<string, string>>({});

  // Création d'une table en plusieurs écritures : mémorisée pour qu'un nouvel essai après une erreur ne crée jamais une seconde table.
  const creation = useRef<{ compteId: string; partId: string; suiteId?: string } | null>(null);

  // ------------------------------------------------------------------------------------------------ données (base locale)
  const charger = useCallback(async () => {
    try {
      const [prod, pop, liste] = await Promise.all([client.listerProduits(), client.produitsPopulaires().catch(() => []), client.listerComptesCafeteria(StatutCompte.OUVERT)]);
      setProduits(prod);
      setPopulaires(new Map(pop.map((p) => [p.produitId, p.quantite])));
      setComptes(liste);
      setErreurChargement(null);
    } catch (e) {
      setErreurChargement(e instanceof Error ? e.message : "Les produits n'ont pas pu être chargés.");
    }
  }, [client]);

  useEffect(() => {
    void charger();
    void synchronisation?.forcer().catch(() => undefined);
    // La base locale est relue régulièrement et au retour sur la fenêtre : une table encaissée ou ouverte depuis un autre poste apparaît sans action.
    const minuteur = setInterval(() => void charger(), 15_000);
    const surFocus = () => void charger();
    window.addEventListener("focus", surFocus);
    return () => {
      clearInterval(minuteur);
      window.removeEventListener("focus", surFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charger]);

  const produitsParId = useMemo(() => new Map(produits.map((p) => [p.id, p])), [produits]);

  const tables = useMemo(() => (comptes ?? []).filter((c) => c.origine !== "SITE_PUBLIC").sort((a, b) => a.ouvertLe.localeCompare(b.ouvertLe)), [comptes]);
  const tableActive = onglet === ONGLET_NOUVELLE_VENTE ? null : (tables.find((c) => c.id === onglet) ?? null);

  // Un onglet dont la table a été fermée ou annulée ailleurs : retour à la nouvelle vente.
  useEffect(() => {
    if (comptes && onglet !== ONGLET_NOUVELLE_VENTE && !tables.some((c) => c.id === onglet)) choisirOnglet(ONGLET_NOUVELLE_VENTE);
  }, [comptes, onglet, tables, choisirOnglet]);

  // Produits choisis qui n'existent plus au catalogue : retirés sans bruit.
  const selection = selectionDe(onglet);
  useEffect(() => {
    if (produits.length === 0) return;
    const propre = nettoyerSelection(selection, new Map(produits.filter((p) => p.actif !== false).map((p) => [p.id, p])));
    if (propre !== selection) definir(onglet, propre);
  }, [produits, selection, onglet, definir]);

  const articles = articlesSelection(selection);
  const totaux = useMemo(() => totauxSelection(selection, produitsParId), [selection, produitsParId]);
  const libelleTotal = libelleTotaux(totaux, fmt);
  const lignesAjout = useMemo<LigneAjout[]>(() => Object.entries(selection).flatMap(([id, quantite]) => (produitsParId.get(id) ? [{ produit: produitsParId.get(id)!, quantite }] : [])), [selection, produitsParId]);

  const onglets = useMemo<OngletVente[]>(() => {
    const n = articlesSelection(selectionDe(ONGLET_NOUVELLE_VENTE));
    return [
      { id: ONGLET_NOUVELLE_VENTE, titre: "Nouvelle vente", sousTitre: n > 0 ? `${n} article${n > 1 ? "s" : ""}` : "vide", nouvelle: true },
      ...tables.map((c) => {
        const reste = resteAPayer(c);
        const paye = dejaPaye(c);
        return { id: c.id, titre: c.tableOuNom, sousTitre: reste.articles > 0 ? libelleTotaux(reste, fmt) : paye.articles > 0 ? "tout est payé" : "vide", paye: paye.articles > 0 };
      }),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, selectionDe, selection]);

  // ------------------------------------------------------------------------------------------------ catalogue affiché
  const categories = useMemo(() => [TOUTES_CATEGORIES, ...categoriesDuSegment(produits, segment)], [produits, segment]);
  useEffect(() => {
    if (!categories.includes(categorie)) setCategorie(TOUTES_CATEGORIES);
  }, [categories, categorie]);
  const visibles = useMemo(() => filtrerProduits(produits, { segment, categorie, recherche, populaires }), [produits, segment, categorie, recherche, populaires]);

  // ------------------------------------------------------------------------------------------------ scan (même comportement que l'ajout de consommations)
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  function ajouterParCode(brut: string): string {
    const code = normaliserCodeBarres(brut);
    if (!code) return "";
    const idAssocie = codesAssocies[code];
    const produit = (idAssocie && produitsParId.get(idAssocie)) || trouverProduitParCode(produits, code);
    if (!produit) {
      bip("erreur");
      setCodeInconnu(code);
      const message = `Code ${code} inconnu`;
      setInfoScan(message);
      return message;
    }
    const limite = limiteDisponible(produit);
    const deja = selectionRef.current[produit.id] ?? 0;
    if (limite !== null && deja + 1 > limite) {
      if (limite <= 0) {
        bipSimple("erreur");
        annoncerStock(produit.nom, true);
      } else bip("erreur");
      const message = limite <= 0 ? `${produit.nom} : épuisé` : `${produit.nom} : plus que ${limite} en stock`;
      setInfoScan(message);
      return message;
    }
    changer(onglet, produit, 1);
    bip("ok");
    setCodeInconnu(null);
    const message = `${produit.nom} ajouté (${deja + 1})`;
    setInfoScan(message);
    return message;
  }
  useDouchette(ajouterParCode, operer && !webcamOuverte && !tableOuverte && !compteOuvert);

  async function associerCode() {
    const code = codeInconnu;
    const produit = produitsParId.get(produitAssocie);
    if (!code || !produit) return;
    try {
      await client.associerCodeBarres(produit.id, code);
      setCodesAssocies((courant) => ({ ...courant, [code]: produit.id }));
      setCodeInconnu(null);
      setProduitAssocie("");
      changer(onglet, produit, 1);
      bip("ok");
      setInfoScan(`Code associé à ${produit.nom} — ajouté.`);
    } catch (e) {
      setInfoScan(e instanceof Error ? e.message : "Association impossible.");
    }
  }

  // ------------------------------------------------------------------------------------------------ actions (toutes écrites d'abord en local)
  async function creerCompteAvecLignes(nom: string, nomPremierePart: string, avecSuite: boolean) {
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

  async function encaisserEtPartir() {
    if (enCours || articles === 0) return;
    setEnCours(true);
    setErreur(null);
    try {
      const c = await creerCompteAvecLignes(`Comptoir ${heureCourte(new Date())}`, "Client", false);
      creation.current = null;
      vider(ONGLET_NOUVELLE_VENTE);
      setTicketOuvert(false);
      setCompteOuvert({ compteId: c.compteId, encaissement: { cible: "tout" }, ongletApres: ONGLET_NOUVELLE_VENTE });
    } catch (e) {
      setErreur(`${e instanceof Error ? e.message : "La vente n'a pas pu être enregistrée."} Réessayez : ce qui est déjà enregistré ne sera pas doublé.`);
    } finally {
      setEnCours(false);
    }
  }

  async function creerTable(choix: { nom: string; payerMaintenant: boolean }) {
    if (enCours || articles === 0) return;
    setEnCours(true);
    setErreur(null);
    try {
      const c = await creerCompteAvecLignes(choix.nom, choix.payerMaintenant ? "Première commande" : "Personne 1", choix.payerMaintenant);
      creation.current = null;
      vider(ONGLET_NOUVELLE_VENTE);
      setTableOuverte(false);
      setTicketOuvert(false);
      if (choix.payerMaintenant) {
        // La part « Première commande » est encaissée ; la table reste ouverte (part « Suite » vide) pour ce que le client prendra ensuite.
        setCompteOuvert({ compteId: c.compteId, encaissement: { cible: c.partId, gardeOuvert: true }, ongletApres: c.compteId });
      } else {
        await charger();
        choisirOnglet(c.compteId);
      }
    } catch (e) {
      setErreur(`${e instanceof Error ? e.message : "La table n'a pas pu être créée."} Réessayez : ce qui est déjà enregistré ne sera pas doublé.`);
    } finally {
      setEnCours(false);
    }
  }

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
      setErreur(`${e instanceof Error ? e.message : "Les produits n'ont pas pu être ajoutés."} Réessayez : ceux déjà enregistrés ne seront pas doublés.`);
      return false;
    } finally {
      setEnCours(false);
    }
  }

  async function encaisserLaTable(compte: CompteCafeteria) {
    if (enCours) return;
    if (!(await ajouterALaTable(compte))) return;
    setCompteOuvert({ compteId: compte.id, encaissement: { cible: "tout" }, ongletApres: ONGLET_NOUVELLE_VENTE });
  }

  async function terminerLaTable(compte: CompteCafeteria) {
    if (!(await demander({ titre: `Terminer « ${compte.tableOuNom} » ?`, message: "Tout est payé : la table sera fermée et disparaîtra des ventes en cours.", libelleConfirmer: "Terminer la table" }))) return;
    try {
      await client.fermerCompteCafeteria(compte.id);
      await charger();
      choisirOnglet(ONGLET_NOUVELLE_VENTE);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La table n'a pas pu être terminée.");
    }
  }

  async function annulerLaTable(compte: CompteCafeteria) {
    if (!(await demander({ titre: `Annuler « ${compte.tableOuNom} » ?`, message: "Cette table est vide : elle disparaît des ventes en cours.", libelleConfirmer: "Annuler la table", destructif: true }))) return;
    try {
      await client.annulerCompteCafeteria(compte.id);
      await charger();
      choisirOnglet(ONGLET_NOUVELLE_VENTE);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La table n'a pas pu être annulée.");
    }
  }

  function retourDuCompte() {
    const apres = compteOuvert?.ongletApres ?? ONGLET_NOUVELLE_VENTE;
    setCompteOuvert(null);
    void charger().then(() => choisirOnglet(apres));
  }

  // ------------------------------------------------------------------------------------------------ ce que le ticket montre
  const reste = tableActive ? resteAPayer(tableActive) : null;
  const paye = tableActive ? dejaPaye(tableActive) : null;
  const libelleReste = reste ? libelleTotaux(reste, fmt) : "";
  const annulable = !!tableActive && raisonRefusAnnulationCompte(tableActive) === null && (reste?.articles ?? 0) === 0 && articles === 0;
  const terminable = !!tableActive && articles === 0 && (reste?.articles ?? 0) === 0 && peutTerminerTable(tableActive);

  const lignesTable = useMemo<LigneTable[]>(() => {
    if (!tableActive) return [];
    const parProduit = new Map<string, LigneTable>();
    for (const part of tableActive.sousComptes.filter((p) => !p.payeLe)) {
      for (const l of part.lignes) {
        const courant = parProduit.get(l.produitId);
        if (courant) courant.quantite += Number(l.quantite);
        else parProduit.set(l.produitId, { cle: l.produitId, produit: l.produit, quantite: Number(l.quantite) });
      }
    }
    return [...parProduit.values()];
  }, [tableActive]);

  const actions: ActionTicket[] = [];
  if (operer) {
    if (!tableActive) {
      actions.push(
        { id: "reste", libelle: "Il reste, créer sa table", icone: <Table2 size={20} aria-hidden="true" />, style: "contour", raccourci: "F9", onClick: () => { setErreur(null); setTableOuverte(true); }, desactive: articles === 0 || enCours },
        { id: "encaisser", libelle: "Encaisser", icone: <Banknote size={22} aria-hidden="true" />, style: "vert", raccourci: "F10", onClick: () => void encaisserEtPartir(), desactive: articles === 0, occupe: enCours }
      );
    } else {
      if (articles > 0) actions.push({ id: "ajouter", libelle: "Ajouter à la table", style: "primaire", raccourci: "F9", onClick: () => void ajouterALaTable(tableActive), occupe: enCours });
      if ((reste?.articles ?? 0) > 0 || articles > 0) {
        const aPayer = libelleTotaux({ usd: (reste?.usd ?? 0) + totaux.usd, cdf: (reste?.cdf ?? 0) + totaux.cdf }, fmt);
        actions.push({ id: "encaisser", libelle: `Encaisser ${aPayer}`, icone: <Banknote size={22} aria-hidden="true" />, style: "vert", raccourci: "F10", onClick: () => void encaisserLaTable(tableActive), desactive: enCours });
      }
      if (terminable) actions.push({ id: "terminer", libelle: "Terminer la table", icone: <CircleCheck size={20} aria-hidden="true" />, style: "primaire", raccourci: "F10", onClick: () => void terminerLaTable(tableActive) });
      if (annulable) actions.push({ id: "annuler", libelle: "Annuler la table", style: "discret", onClick: () => void annulerLaTable(tableActive) });
    }
  }

  // Raccourcis : F2 scanner, Ctrl+K recherche, F9 / F10 les deux boutons du ticket.
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    if (compteOuvert || tableOuverte) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        if (operer) setWebcamOuverte(true);
      } else if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        champRecherche.current?.focus();
        champRecherche.current?.select();
      } else if (e.key === "F9" || e.key === "F10") {
        const touche = e.key;
        const action = actionsRef.current.find((a) => a.raccourci === touche && !a.desactive && !a.occupe);
        if (action) {
          e.preventDefault();
          action.onClick();
        }
      }
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [compteOuvert, tableOuverte, operer]);

  // ------------------------------------------------------------------------------------------------ rendu
  if (compteOuvert) {
    return (
      <EcranCompteCafeteria
        client={client}
        utilisateur={utilisateur}
        compteId={compteOuvert.compteId}
        interfaceImprimante={interfaceImprimante}
        synchronisation={synchronisation}
        encaissementAuDemarrage={compteOuvert.encaissement}
        onRetour={retourDuCompte}
      />
    );
  }

  const ticket = (
    <TicketVente
      titre={tableActive ? tableActive.tableOuNom : "Nouvelle vente"}
      sousTitre={tableActive ? (paye && paye.articles > 0 ? "Une partie est déjà payée" : undefined) : undefined}
      lignesAjout={lignesAjout}
      libelleAjout="À ajouter"
      lignesTable={tableActive ? lignesTable : undefined}
      dejaPaye={tableActive && paye ? { articles: paye.articles, libelle: libelleTotaux(paye, fmt) } : null}
      total={
        tableActive
          ? { libelle: articles > 0 ? "À payer après ajout" : "Reste à payer", lignes: [libelleTotaux({ usd: (reste?.usd ?? 0) + totaux.usd, cdf: (reste?.cdf ?? 0) + totaux.cdf }, fmt)] }
          : { libelle: "Total", lignes: [totaux.usd > 0 ? fmt(totaux.usd, "USD") : null, totaux.cdf > 0 ? fmt(totaux.cdf, "CDF") : null].filter((x): x is string => !!x).concat(totaux.usd === 0 && totaux.cdf === 0 ? [fmt(0, "USD")] : []) }
      }
      actions={actions}
      erreur={tableOuverte ? null : erreur}
      aide={!tableActive && operer ? "Encaisser : le client paie et part. Reçu « Comptoir »." : undefined}
      onChanger={(p, d) => changer(onglet, p, d)}
      onVider={() => vider(onglet)}
      onDetail={tableActive ? () => setCompteOuvert({ compteId: tableActive.id, ongletApres: tableActive.id }) : undefined}
      onFermer={large ? undefined : () => setTicketOuvert(false)}
      lectureSeule={!operer}
    />
  );

  const barreNecessaire = !large && operer && (articles > 0 || (tableActive && ((reste?.articles ?? 0) > 0 || terminable)));

  return (
    <div className={`vente${large ? "" : " vente--etroit"}`}>
      <div className="vente__principal">
        <header className="vente__entete">
          <h1 className="hc-text-display-md vente__titre">Vente</h1>
          {!operer && <p className="vente-bandeau">Lecture seule : le patron consulte la caisse sans vendre.</p>}
        </header>

        <OngletsVentes onglets={onglets} actif={onglet} onChoisir={choisirOnglet} />

        <div className="vente__outils">
          <label className="vente-recherche">
            <Search size={20} aria-hidden="true" />
            <input
              ref={champRecherche}
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un produit… (ou scannez avec la douchette)"
              aria-label="Rechercher un produit"
              autoComplete="off"
            />
            {recherche ? (
              <button type="button" onClick={() => setRecherche("")} aria-label="Effacer la recherche">
                <X size={18} aria-hidden="true" />
              </button>
            ) : (
              <kbd>Ctrl + K</kbd>
            )}
          </label>
          {operer && (
            <Button type="button" className="vente-scanner" onClick={() => setWebcamOuverte(true)}>
              <Camera size={20} aria-hidden="true" /> Scanner <kbd>F2</kbd>
            </Button>
          )}
        </div>

        {infoScan && (
          <div className={`vente-scan${codeInconnu ? " vente-scan--erreur" : ""}`} role={codeInconnu ? "alert" : "status"}>
            <ScanBarcode size={18} aria-hidden="true" />
            <span>{infoScan}</span>
            {codeInconnu && (
              <>
                <select value={produitAssocie} onChange={(e) => setProduitAssocie(e.target.value)} aria-label="Produit à associer à ce code">
                  <option value="">Associer à…</option>
                  {produits.filter((p) => p.typeProduit !== TypeProduit.PLAT && !p.codeBarres).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </select>
                <Button type="button" size="sm" onClick={() => void associerCode()} disabled={!produitAssocie}>
                  Associer
                </Button>
              </>
            )}
            <button type="button" className="vente-fermer" onClick={() => { setInfoScan(null); setCodeInconnu(null); }} aria-label="Fermer le message">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="vente__filtres">
          <div className="vente-segments" role="tablist" aria-label="Type de produit">
            {SEGMENTS.map((s) => {
              const Icone = ICONE_SEGMENT[s];
              return (
                <button key={s} type="button" role="tab" aria-selected={s === segment} className={`vente-segment${s === segment ? " vente-segment--actif" : ""}`} onClick={() => setSegment(s)}>
                  <Icone size={19} aria-hidden="true" /> {LIBELLE_SEGMENT[s]}
                </button>
              );
            })}
          </div>
          {categories.length > 2 && (
            <div className="vente-puces" role="group" aria-label="Catégories">
              {categories.map((c) => (
                <button key={c} type="button" className={`vente-puce-filtre${c === categorie ? " vente-puce-filtre--active" : ""}`} aria-pressed={c === categorie} onClick={() => setCategorie(c)}>
                  {c === TOUTES_CATEGORIES && <Star size={14} aria-hidden="true" />}
                  {c === TOUTES_CATEGORIES ? "Populaires" : c}
                </button>
              ))}
            </div>
          )}
        </div>

        {erreurChargement && (
          <p role="alert" className="vente-erreur">
            {erreurChargement}
          </p>
        )}
        {erreur && !large && !ticketOuvert && !tableOuverte && (
          <p role="alert" className="vente-erreur">
            {erreur}
          </p>
        )}

        {visibles.length === 0 ? (
          <p className="vente-vide">{comptes === null ? "Chargement…" : recherche ? "Aucun produit ne correspond à la recherche." : "Aucun produit disponible."}</p>
        ) : (
          <div className="vente-grille">
            {visibles.map((p) => (
              <CarteProduit key={p.id} produit={p} quantite={selection[p.id] ?? 0} onChanger={(d) => changer(onglet, p, d)} lectureSeule={!operer} />
            ))}
          </div>
        )}
      </div>

      {large ? <div className="vente__ticket">{ticket}</div> : ticketOuvert && <div className="vente__volet" onMouseDown={(e) => e.target === e.currentTarget && setTicketOuvert(false)}><div className="vente__ticket vente__ticket--volet">{ticket}</div></div>}

      {barreNecessaire && (
        <div className="vente-barre" role="region" aria-label="Résumé de la vente">
          <span className="vente-barre__texte">
            <span>{tableActive ? (articles > 0 ? `${tableActive.tableOuNom} · ${articles} à ajouter` : `${tableActive.tableOuNom} · à payer`) : `Nouvelle vente · ${articles} article${articles > 1 ? "s" : ""}`}</span>
            <strong>{articles > 0 ? libelleTotal : (reste?.articles ?? 0) > 0 ? libelleReste : "Tout est payé"}</strong>
          </span>
          <Button type="button" className="vente-barre__bouton" onClick={() => { setErreur(null); setTicketOuvert(true); }}>
            <ShoppingCart size={18} aria-hidden="true" /> Voir le ticket
          </Button>
        </div>
      )}

      {tableOuverte && (
        <DialogueCreerTable
          nomInitial={nomTableSuivante(tables)}
          articles={articles}
          totalLibelle={libelleTotal}
          onFermer={() => !enCours && setTableOuverte(false)}
          onValider={(choix) => void creerTable(choix)}
          enCours={enCours}
          erreur={erreur}
        />
      )}
      {webcamOuverte && <ScannerWebcam mode="continu" onCode={ajouterParCode} onFermer={() => setWebcamOuverte(false)} titre={tableActive ? `Scanner pour ${tableActive.tableOuNom}` : "Scanner pour la nouvelle vente"} />}
      {dialogue}
    </div>
  );
}
