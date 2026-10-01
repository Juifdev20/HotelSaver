import * as React from "react";
import { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Minus, Plus, Search, X } from "lucide-react-native";
import { Devise, type Produit } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useSession } from "../contexteSession";
import { creerLigneLocal, type CompteCafeteriaMiroir, type SousCompteMiroir } from "../stockage/cafeteriaMirroir";

export interface EcranAjoutConsommationProps {
  compte: CompteCafeteriaMiroir;
  personne: SousCompteMiroir;
  produits: Produit[];
  /** Quantités ajoutées aujourd'hui par produit (les plus demandés passent en tête). */
  populaires: Map<string, number>;
  onRetour: () => void;
  /** Panier validé : l'écran du compte recharge ses données et revient à la vue d'ensemble. */
  onAjoute: () => void;
}

const NB_POPULAIRES = 6;
const TOUTES = "Tous";

/** « Fanta » = « fanta » = « Fänta » : recherche insensible à la casse et aux accents. */
function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

type Ligne = { cle: string; titre: string } | { cle: string; produit: Produit };

/**
 * Niveau 2 du compte : ajouter des consommations À UNE PERSONNE. Recherche, filtre par catégorie,
 * produits les plus demandés du jour en tête, plusieurs produits en un seul « panier » validé d'un
 * coup. Écrit le miroir local tout de suite et met chaque ligne en file (marche hors ligne, comme
 * l'ancien formulaire) ; le serveur contrôle le stock à la synchronisation.
 */
export function EcranAjoutConsommation({ compte, personne, produits, populaires, onRetour, onAjoute }: EcranAjoutConsommationProps) {
  const { moteurSync } = useSession();
  const insets = useSafeAreaInsets();
  const [recherche, setRecherche] = useState("");
  const [categorie, setCategorie] = useState(TOUTES);
  const [panier, setPanier] = useState<Record<string, number>>({});
  const [enEnvoi, setEnEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

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
    const stock = Number(produit.stockActuel);
    setErreur(null);
    setPanier((courant) => {
      const quantite = Math.max(0, (courant[produit.id] ?? 0) + delta);
      // Jamais plus que le stock connu (le serveur recontrôle de toute façon).
      if (delta > 0 && stock > 0 && quantite > stock) return courant;
      const suivant = { ...courant };
      if (quantite === 0) delete suivant[produit.id];
      else suivant[produit.id] = quantite;
      return suivant;
    });
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
    if (personne.remoteId === null) {
      setErreur("Cette personne est en cours de synchronisation, réessayez dans un instant.");
      return;
    }
    setEnEnvoi(true);
    setErreur(null);
    try {
      for (const [produitId, quantite] of Object.entries(panier)) {
        const produit = produitsParId.get(produitId);
        if (!produit) continue;
        const ligne = await creerLigneLocal(personne.id, produit, quantite);
        await moteurSync.mettreEnFile({
          entiteType: "LigneCommande",
          localId: ligne.id,
          operation: "CREATE",
          payload: {
            compteId: compte.remoteId ?? compte.id,
            sousCompteId: personne.remoteId ?? personne.id,
            produitId: produit.id,
            quantite,
          },
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

      <View style={styles.rechercheConteneur}>
        <Search size={18} color={couleurs.encreFaible} />
        <TextInput
          style={styles.champ}
          value={recherche}
          onChangeText={setRecherche}
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
        ListEmptyComponent={
          <Text style={styles.vide}>{recherche ? "Aucun produit ne correspond à la recherche." : "Aucun produit disponible."}</Text>
        }
        renderItem={({ item }) => {
          if ("titre" in item) return <Text style={styles.titreSection}>{item.titre}</Text>;
          const p = item.produit;
          const quantite = panier[p.id] ?? 0;
          const stock = Number(p.stockActuel);
          const epuise = stock <= 0;
          const bas = !epuise && stock <= Number(p.seuilAlerte);
          return (
            <View style={[styles.carte, quantite > 0 && styles.carteChoisie, epuise && styles.carteEpuisee]}>
              <View style={styles.infos}>
                <Text style={styles.nom} numberOfLines={1}>
                  {p.nom}
                </Text>
                <View style={styles.ligneMeta}>
                  <Text style={styles.prix}>{formatMontant(Number(p.prix), p.devise)}</Text>
                  {epuise && <Text style={styles.etatEpuise}>Épuisé</Text>}
                  {bas && <Text style={styles.etatBas}>Stock bas · {stock}</Text>}
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
    height: 46,
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface200,
  },
  champ: { flex: 1, fontSize: 15, color: couleurs.encre, paddingVertical: 0 },
  puces: { gap: espacements.s2, paddingHorizontal: espacements.s4, paddingVertical: espacements.s3 },
  puce: {
    paddingHorizontal: espacements.s3,
    height: 34,
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
  boutonValider: { height: 50, borderRadius: rayons.sm, backgroundColor: couleurs.succes, alignItems: "center", justifyContent: "center", paddingHorizontal: espacements.s3 },
  boutonDesactive: { opacity: 0.45 },
  boutonValiderTexte: { color: "#fff", fontWeight: "700", fontSize: 14, textAlign: "center" },
});
