import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, Minus, Plus, ScanBarcode, Search, Star, X } from "lucide-react-native";
import { normaliserCodeBarres, trouverProduitParCode } from "@hotel-chicago/receipts";
import { Devise, TypeProduit, type CompteCafeteria, type MenuDuJour, type Produit, type SousCompte } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { ScannerCodeBarres } from "../composants/ScannerCodeBarres";
import { SelecteurProduit } from "../composants/SelecteurProduit";

export interface EcranAjoutConsommationProps {
  compte: CompteCafeteria;
  personne: SousCompte;
  produits: Produit[];
  /** Quantités ajoutées aujourd'hui par produit (les plus demandés passent en tête). */
  populaires: Map<string, number>;
  /** Menu du jour actif, null si non défini. */
  menuDuJour?: MenuDuJour | null;
  onRetour: () => void;
  /** Panier validé : l'écran du compte recharge ses données et revient à la vue d'ensemble. */
  onAjoute: () => void;
  /** « Vente rapide » : la caméra s'ouvre dès l'arrivée sur l'écran. */
  scannerAuDemarrage?: boolean;
}

/** Retour tactile à la caissière (sans dépendance) : court = ajouté,
 * double long = code inconnu ou article épuisé. */
const VIBRATION_OK = 60;
const VIBRATION_ERREUR = [0, 180, 120, 180];

const NB_POPULAIRES = 6;
const TOUTES = "Tous";

/** Quantité encore vendable : stock pour un article, portions pour un plat
 * (null = illimité — un plat sans portions déclarées n'est jamais « épuisé »). */
function limiteDisponible(produit: Produit): number | null {
  if (produit.typeProduit === TypeProduit.PLAT) {
    return produit.portionsDisponibles ?? null;
  }
  return Number(produit.stockActuel);
}

/** « Fanta » = « fanta » = « Fänta » : recherche insensible à la casse et aux accents. */
function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

type Ligne = { cle: string; titre: string } | { cle: string; produit: Produit };

/**
 * Niveau 2 du compte : ajouter des consommations À UNE PERSONNE. Recherche, filtre par catégorie,
 * produits les plus demandés du jour en tête, plusieurs produits en un seul « panier » validé d'un
 * coup. Chaque ligne s'écrit tout de suite dans la base locale (marche hors ligne,
 * stock décompté localement) ; le serveur recontrôle le stock à la synchronisation.
 */
export function EcranAjoutConsommation({
  compte,
  personne,
  produits,
  populaires,
  menuDuJour,
  onRetour,
  onAjoute,
  scannerAuDemarrage = false,
}: EcranAjoutConsommationProps) {
  const { client } = useSession();
  const etatSync = useSyncEtat();
  const insets = useSafeAreaInsets();
  const [recherche, setRecherche] = useState("");
  const [categorie, setCategorie] = useState(TOUTES);
  const [panier, setPanier] = useState<Record<string, number>>({});
  const [enEnvoi, setEnEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Scan (08/10/2026) : caméra, douchette (champ caché toujours focalisé, le
  // clavier virtuel ne s'ouvre pas), code inconnu à associer.
  const [scannerOuvert, setScannerOuvert] = useState(scannerAuDemarrage);
  const [saisieDouchette, setSaisieDouchette] = useState("");
  const [infoScan, setInfoScan] = useState<string | null>(null);
  const [codeInconnu, setCodeInconnu] = useState<string | null>(null);
  const [selecteurAssociation, setSelecteurAssociation] = useState(false);
  const [codesAssocies, setCodesAssocies] = useState<Record<string, string>>({});
  const champDouchette = useRef<TextInput>(null);
  const panierRef = useRef(panier);
  panierRef.current = panier;

  useEffect(() => {
    if (!scannerOuvert && !selecteurAssociation) champDouchette.current?.focus();
  }, [scannerOuvert, selecteurAssociation]);

  const categories = useMemo(
    () => [TOUTES, ...Array.from(new Set(produits.map((p) => p.categorie.trim()).filter(Boolean))).sort()],
    [produits]
  );

  const lignes = useMemo<Ligne[]>(() => {
    const terme = normaliser(recherche);
    const parPopularite = (a: Produit, b: Produit) =>
      (populaires.get(b.id) ?? 0) - (populaires.get(a.id) ?? 0) || a.nom.localeCompare(b.nom, "fr");
    const filtres = produits
      .filter((p) => (categorie === TOUTES || p.categorie.trim() === categorie) && (!terme || normaliser(p.nom).includes(terme)))
      .sort(parPopularite);

    if (terme) return filtres.map((p) => ({ cle: p.id, produit: p }));

    const top = filtres.filter((p) => (populaires.get(p.id) ?? 0) > 0).slice(0, NB_POPULAIRES);
    const idsTop = new Set(top.map((p) => p.id));
    const resultat: Ligne[] = [];
    if (top.length > 0) {
      resultat.push({ cle: "t-populaires", titre: "Populaires aujourd'hui" });
      top.forEach((p) => resultat.push({ cle: `pop-${p.id}`, produit: p }));
      resultat.push({ cle: "t-tous", titre: categorie === TOUTES ? "Tous les produits" : categorie });
    }
    filtres.filter((p) => !idsTop.has(p.id)).forEach((p) => resultat.push({ cle: p.id, produit: p }));
    return resultat;
  }, [produits, populaires, recherche, categorie]);

  const produitsParId = useMemo(() => new Map(produits.map((p) => [p.id, p])), [produits]);
  const articles = Object.values(panier).reduce((n, q) => n + q, 0);
  const totaux = useMemo(() => {
    let usd = 0;
    let cdf = 0;
    for (const [id, quantite] of Object.entries(panier)) {
      const produit = produitsParId.get(id);
      if (!produit) continue;
      const montant = Number(produit.prix) * quantite;
      if (produit.devise === Devise.USD) usd += montant;
      else cdf += montant;
    }
    return { usd, cdf };
  }, [panier, produitsParId]);

  function changer(produit: Produit, delta: number) {
    const limite = limiteDisponible(produit);
    setErreur(null);
    setPanier((courant) => {
      const quantite = Math.max(0, (courant[produit.id] ?? 0) + delta);
      // Jamais plus que la limite connue, quand il y en a une (le serveur
      // recontrôle de toute façon).
      if (delta > 0 && limite != null && limite > 0 && quantite > limite) return courant;
      const suivant = { ...courant };
      if (quantite === 0) delete suivant[produit.id];
      else suivant[produit.id] = quantite;
      return suivant;
    });
  }

  /** Un code lu (caméra, douchette ou recherche) : ajoute l'article au panier
   * si le catalogue le connaît. Recherche locale, instantanée et hors ligne. */
  function ajouterParCode(brut: string): string {
    const code = normaliserCodeBarres(brut);
    if (!code) return "";
    const idAssocie = codesAssocies[code];
    const produit = (idAssocie && produitsParId.get(idAssocie)) || trouverProduitParCode(produits, code);
    if (!produit) {
      Vibration.vibrate(VIBRATION_ERREUR);
      setCodeInconnu(code);
      const message = `Code ${code} inconnu`;
      setInfoScan(message);
      return message;
    }
    const limite = limiteDisponible(produit);
    const deja = panierRef.current[produit.id] ?? 0;
    if (limite != null && deja + 1 > limite) {
      Vibration.vibrate(VIBRATION_ERREUR);
      const message = limite <= 0 ? `${produit.nom} : épuisé` : `${produit.nom} : plus que ${limite} en stock`;
      setInfoScan(message);
      return message;
    }
    changer(produit, 1);
    Vibration.vibrate(VIBRATION_OK);
    setCodeInconnu(null);
    const message = `${produit.nom} ajouté (${deja + 1})`;
    setInfoScan(message);
    return message;
  }

  /** La caissière a choisi le produit correspondant au code inconnu : le
   * code lui est associé côté serveur (route ouverte à la cafétaria), écrit
   * dans le miroir, et l'article part au panier. */
  async function associerCode(produit: Produit) {
    const code = codeInconnu;
    setSelecteurAssociation(false);
    if (!code) return;
    try {
      await client.associerCodeBarres(produit.id, code);
      setCodesAssocies((courant) => ({ ...courant, [code]: produit.id }));
      setCodeInconnu(null);
      changer(produit, 1);
      Vibration.vibrate(VIBRATION_OK);
      setInfoScan(`Code associé à ${produit.nom} — ajouté au panier.`);
    } catch (e) {
      setInfoScan(e instanceof Error ? e.message : "Association impossible.");
    }
  }

  function retour() {
    if (articles === 0) return onRetour();
    Alert.alert("Abandonner la sélection ?", "Les produits choisis ne seront pas ajoutés.", [
      { text: "Continuer", style: "cancel" },
      { text: "Abandonner", style: "destructive", onPress: onRetour },
    ]);
  }

  async function valider() {
    if (articles === 0 || enEnvoi) return;
    setEnEnvoi(true);
    setErreur(null);
    try {
      for (const [produitId, quantite] of Object.entries(panier)) {
        const produit = produitsParId.get(produitId);
        if (!produit) continue;
        await client.ajouterLigne(compte.id, { sousCompteId: personne.id, produitId: produit.id, quantite });
        // Déjà enregistrée : en cas d'échec d'une ligne suivante, un nouvel essai ne la double pas.
        setPanier((courant) => {
          const suivant = { ...courant };
          delete suivant[produitId];
          return suivant;
        });
      }
      onAjoute();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
      setEnEnvoi(false);
    }
  }

  const libelleTotal = [
    totaux.usd > 0 ? formatMontant(totaux.usd, Devise.USD) : null,
    totaux.cdf > 0 ? formatMontant(totaux.cdf, Devise.CDF) : null,
  ]
    .filter(Boolean)
    .join(" + ");

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre={`Ajouter pour ${personne.nom}`} sousTitre={compte.tableOuNom} onRetour={retour} />

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

      <View style={styles.ligneRecherche}>
        <View style={[styles.rechercheConteneur, { flex: 1, marginHorizontal: 0 }]}>
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
              if (!scannerOuvert) champDouchette.current?.focus();
            }}
            placeholder="Rechercher un produit"
            placeholderTextColor={couleurs.encreFaible}
            autoCorrect={false}
            returnKeyType="search"
          />
          {recherche.length > 0 && (
            <Pressable onPress={() => setRecherche("")} hitSlop={10} accessibilityLabel="Effacer la recherche">
              <X size={18} color={couleurs.encreAttenuee} />
            </Pressable>
          )}
        </View>
        <Pressable style={styles.boutonScanner} onPress={() => setScannerOuvert(true)} accessibilityLabel="Scanner avec la caméra">
          <Camera size={20} color="#fff" />
        </Pressable>
      </View>

      {infoScan && (
        <View style={[styles.bandeauScan, codeInconnu ? styles.bandeauScanErreur : null]}>
          <ScanBarcode size={16} color={codeInconnu ? couleurs.danger : couleurs.succes} />
          <Text style={styles.bandeauScanTexte} numberOfLines={2}>
            {infoScan}
          </Text>
          {codeInconnu && (
            <Pressable
              onPress={() =>
                etatSync.enLigne
                  ? setSelecteurAssociation(true)
                  : setInfoScan(`Code ${codeInconnu} inconnu — associez-le quand le réseau revient.`)
              }
              hitSlop={8}
            >
              <Text style={styles.bandeauScanAction}>Associer</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              setInfoScan(null);
              setCodeInconnu(null);
            }}
            hitSlop={8}
            accessibilityLabel="Fermer le message"
          >
            <X size={16} color={couleurs.encreAttenuee} />
          </Pressable>
        </View>
      )}

      {categories.length > 2 && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.puces}>
            {categories.map((c) => (
              <Pressable key={c} style={[styles.puce, categorie === c && styles.puceActive]} onPress={() => setCategorie(c)}>
                <Text style={[styles.puceTexte, categorie === c && styles.puceTexteActif]}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={lignes}
        keyExtractor={(l) => l.cle}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.liste}
        ListHeaderComponent={
          menuDuJour && menuDuJour.items.length > 0 ? (
            <View style={styles.menuDuJour}>
              <View style={styles.menuDuJourTitre}>
                <Star size={13} color={couleurs.alerte} fill={couleurs.alerte} />
                <Text style={styles.menuDuJourTitreTexte}>Menu du jour</Text>
              </View>
              {menuDuJour.items
                .filter((item) => produits.find((p) => p.id === item.produitId))
                .map((item) => {
                  const p = produits.find((pp) => pp.id === item.produitId)!;
                  const prixAffiche = item.prixSpecial ?? p.prix;
                  const deviseAffichee = (item.deviseSpeciale ?? p.devise) as Devise;
                  const quantite = panier[p.id] ?? 0;
                  const limite = limiteDisponible(p);
                  const epuise = limite != null && limite <= 0;
                  return (
                    <View key={item.produitId} style={[styles.carte, quantite > 0 && styles.carteChoisie, epuise && styles.carteEpuisee]}>
                      <View style={styles.infos}>
                        <Text style={styles.nom} numberOfLines={1}>{p.nom}</Text>
                        <Text style={styles.prix}>{formatMontant(Number(prixAffiche), deviseAffichee)}</Text>
                      </View>
                      {!epuise && (quantite === 0 ? (
                        <Pressable style={styles.boutonAjout} onPress={() => changer({ ...p, prix: prixAffiche, devise: deviseAffichee }, 1)} accessibilityLabel={`Ajouter ${p.nom}`}>
                          <Plus size={20} color="#fff" />
                        </Pressable>
                      ) : (
                        <View style={styles.stepper}>
                          <Pressable style={styles.stepperBouton} onPress={() => changer({ ...p, prix: prixAffiche, devise: deviseAffichee }, -1)} hitSlop={6}>
                            <Minus size={18} color={couleurs.bleu} />
                          </Pressable>
                          <Text style={styles.stepperValeur}>{quantite}</Text>
                          <Pressable style={styles.stepperBouton} onPress={() => changer({ ...p, prix: prixAffiche, devise: deviseAffichee }, 1)} hitSlop={6}>
                            <Plus size={18} color={couleurs.bleu} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  );
                })}
              <View style={styles.menuDuJourSeparateur} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.vide}>{recherche ? "Aucun produit ne correspond à la recherche." : "Aucun produit disponible."}</Text>
        }
        renderItem={({ item }) => {
          if ("titre" in item) return <Text style={styles.titreSection}>{item.titre}</Text>;
          const p = item.produit;
          const quantite = panier[p.id] ?? 0;
          const limite = limiteDisponible(p);
          const epuise = limite != null && limite <= 0;
          const bas = p.typeProduit !== TypeProduit.PLAT && !epuise && limite != null && limite <= Number(p.seuilAlerte);
          return (
            <View style={[styles.carte, quantite > 0 && styles.carteChoisie, epuise && styles.carteEpuisee]}>
              <View style={styles.infos}>
                <Text style={styles.nom} numberOfLines={1}>
                  {p.nom}
                </Text>
                <View style={styles.ligneMeta}>
                  <Text style={styles.prix}>{formatMontant(Number(p.prix), p.devise)}</Text>
                  {epuise && <Text style={styles.etatEpuise}>Épuisé</Text>}
                  {bas && <Text style={styles.etatBas}>Stock bas · {limite}</Text>}
                  {p.typeProduit === TypeProduit.PLAT && limite != null && !epuise && (
                    <Text style={styles.etatBas}>Reste {limite} portion{limite > 1 ? "s" : ""}</Text>
                  )}
                </View>
              </View>
              {epuise ? null : quantite === 0 ? (
                <Pressable style={styles.boutonAjout} onPress={() => changer(p, 1)} accessibilityLabel={`Ajouter ${p.nom}`}>
                  <Plus size={20} color="#fff" />
                </Pressable>
              ) : (
                <View style={styles.stepper}>
                  <Pressable style={styles.stepperBouton} onPress={() => changer(p, -1)} hitSlop={6} accessibilityLabel={`Retirer ${p.nom}`}>
                    <Minus size={18} color={couleurs.bleu} />
                  </Pressable>
                  <Text style={styles.stepperValeur}>{quantite}</Text>
                  <Pressable style={styles.stepperBouton} onPress={() => changer(p, 1)} hitSlop={6} accessibilityLabel={`Ajouter ${p.nom}`}>
                    <Plus size={18} color={couleurs.bleu} />
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
      />

      <ScannerCodeBarres
        visible={scannerOuvert}
        mode="continu"
        onCode={ajouterParCode}
        onFermer={() => setScannerOuvert(false)}
        titre={`Scanner pour ${personne.nom}`}
      />

      <SelecteurProduit
        visible={selecteurAssociation}
        produits={produits.filter((p) => p.typeProduit !== TypeProduit.PLAT && !p.codeBarres)}
        onChoisir={(p) => void associerCode(p)}
        onFermer={() => setSelecteurAssociation(false)}
      />

      <View style={[styles.barre, { paddingBottom: espacements.s3 + Math.min(insets.bottom, 8) }]}>
        {erreur && <Text style={styles.erreur}>{erreur}</Text>}
        <Pressable
          style={[styles.boutonValider, (articles === 0 || enEnvoi) && styles.boutonDesactive]}
          onPress={valider}
          disabled={articles === 0 || enEnvoi}
        >
          <Text style={styles.boutonValiderTexte}>
            {enEnvoi
              ? "Ajout en cours…"
              : articles === 0
                ? "Choisissez des produits"
                : `Ajouter à ${personne.nom} · ${articles} article${articles > 1 ? "s" : ""} · ${libelleTotal}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  rechercheConteneur: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s2,
    marginHorizontal: espacements.s4,
    paddingHorizontal: espacements.s3,
    minHeight: 46,
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface200,
  },
  champ: { flex: 1, fontSize: 15, color: couleurs.encre, paddingVertical: 0 },
  champCache: { position: "absolute", width: 1, height: 1, opacity: 0, left: -10, top: -10 },
  ligneRecherche: { flexDirection: "row", alignItems: "center", gap: espacements.s2, marginHorizontal: espacements.s4 },
  boutonScanner: {
    width: 46,
    height: 46,
    borderRadius: rayons.md,
    backgroundColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
  },
  bandeauScan: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s2,
    marginHorizontal: espacements.s4,
    marginTop: espacements.s2,
    padding: espacements.s2,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.succesClair,
  },
  bandeauScanErreur: { backgroundColor: couleurs.dangerClair },
  bandeauScanTexte: { flex: 1, fontSize: 13, color: couleurs.encre },
  bandeauScanAction: { fontSize: 13, fontWeight: "700", color: couleurs.bleu },
  puces: { gap: espacements.s2, paddingHorizontal: espacements.s4, paddingVertical: espacements.s3 },
  puce: {
    paddingHorizontal: espacements.s3,
    minHeight: 44,
    borderRadius: rayons.pill,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface200,
    alignItems: "center",
    justifyContent: "center",
  },
  puceActive: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  puceTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  puceTexteActif: { color: "#fff" },
  liste: { paddingHorizontal: espacements.s4, paddingTop: espacements.s2, paddingBottom: espacements.s5, gap: espacements.s2 },
  titreSection: { fontSize: 12, fontWeight: "700", color: couleurs.encreAttenuee, textTransform: "uppercase", marginTop: espacements.s3 },
  vide: { textAlign: "center", color: couleurs.encreAttenuee, marginTop: espacements.s6, fontSize: 14 },
  carte: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s3,
    padding: espacements.s3,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface200,
  },
  carteChoisie: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  carteEpuisee: { opacity: 0.5 },
  infos: { flex: 1, gap: 2 },
  nom: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  ligneMeta: { flexDirection: "row", alignItems: "center", gap: espacements.s2 },
  prix: { fontSize: 13, color: couleurs.encreAttenuee, fontWeight: "600" },
  etatEpuise: { fontSize: 11, fontWeight: "700", color: couleurs.danger },
  etatBas: { fontSize: 11, fontWeight: "700", color: couleurs.alerte },
  boutonAjout: { width: 40, height: 40, borderRadius: rayons.pill, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  stepper: { flexDirection: "row", alignItems: "center", gap: espacements.s2 },
  stepperBouton: {
    width: 36,
    height: 36,
    borderRadius: rayons.pill,
    borderWidth: 1,
    borderColor: couleurs.bleu,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValeur: { minWidth: 24, textAlign: "center", fontSize: 16, fontWeight: "800", color: couleurs.navy },
  barre: {
    gap: espacements.s2,
    padding: espacements.s3,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    backgroundColor: couleurs.surface200,
  },
  erreur: { color: couleurs.danger, fontSize: 13 },
  boutonValider: { minHeight: 50, borderRadius: rayons.sm, backgroundColor: couleurs.succes, alignItems: "center", justifyContent: "center", paddingHorizontal: espacements.s3 },
  boutonDesactive: { opacity: 0.45 },
  boutonValiderTexte: { color: "#fff", fontWeight: "700", fontSize: 14, textAlign: "center" },
  menuDuJour: { gap: espacements.s2, paddingBottom: espacements.s2 },
  menuDuJourTitre: { flexDirection: "row", alignItems: "center", gap: 6 },
  menuDuJourTitreTexte: { fontSize: 12, fontWeight: "700", color: couleurs.alerte, textTransform: "uppercase" },
  menuDuJourSeparateur: { height: 1, backgroundColor: couleurs.bordure, marginTop: espacements.s2 },
});
