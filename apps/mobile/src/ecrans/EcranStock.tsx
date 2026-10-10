import * as React from "react";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { MouvementStock, Produit } from "@hotel-chicago/types";
import { Package, TrendingUp } from "lucide-react-native";
import { formatMontant } from "../formatMontant";
import { BoutonAjouterFlottant } from "../composants/BoutonAjouterFlottant";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { FeuilleModale } from "../composants/FeuilleModale";
import { SelecteurProduit } from "../composants/SelecteurProduit";
import { useDonnee } from "../hooks/useDonnee";
import { lireQuantite } from "@hotel-chicago/regles";
import { messageErreur } from "../messagesErreur";

export interface EcranStockProps {
  client: ClientApi;
  onRetour: () => void;
}

const TYPES: { valeur: "ENTREE" | "PERTE" | "AJUSTEMENT"; libelle: string }[] = [
  { valeur: "ENTREE", libelle: "Entrée" },
  { valeur: "PERTE", libelle: "Perte" },
  { valeur: "AJUSTEMENT", libelle: "Ajustement" },
];

const LIBELLE_TYPE: Record<string, string> = {
  ENTREE: "Entrée",
  SORTIE_VENTE: "Vente",
  PERTE: "Perte",
  AJUSTEMENT: "Ajustement",
};

/** SORTIE_VENTE n'apparaît jamais dans le formulaire : généré automatiquement
 * par une ligne de commande cafétaria (voir stock.service.ts), jamais saisi
 * à la main — seuls ENTREE/PERTE/AJUSTEMENT sont des mouvements manuels. */
export function EcranStock({ client, onRetour }: EcranStockProps) {
  const { donnee: mouvements, erreur, enCours, recharger } = useDonnee(() => client.listerMouvementsStock(), client);
  const { donnee: produits, erreur: erreurProduits, recharger: rechargerProduits } = useDonnee(() => client.listerProduits(), client);

  const [onglet, setOnglet] = useState<"mouvements" | "valeur">("mouvements");
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [selecteurOuvert, setSelecteurOuvert] = useState(false);
  const [produit, setProduit] = useState<Produit | null>(null);
  const [type, setType] = useState<(typeof TYPES)[number]["valeur"]>("ENTREE");
  const [quantite, setQuantite] = useState("");
  const [motif, setMotif] = useState("");
  const [enEnvoi, setEnEnvoi] = useState(false);
  const [erreurFormulaire, setErreurFormulaire] = useState<string | null>(null);

  // Seuls les articles de comptoir ont un stock — les plats sont préparés à
  // la commande et n'apparaissent ni dans les mouvements ni dans la valeur.
  const produitsActifs = useMemo(() => (produits ?? []).filter((p) => p.actif && p.typeProduit !== "PLAT"), [produits]);

  function ouvrirFormulaire() {
    setProduit(null);
    setType("ENTREE");
    setQuantite("");
    setMotif("");
    setErreurFormulaire(null);
    setModaleOuverte(true);
  }

  async function enregistrer() {
    if (!produit) {
      setErreurFormulaire("Choisissez un produit.");
      return;
    }
    // Un ajustement peut être négatif (correction à la baisse) : le signe se lit à part, la quantité reste positive.
    const brute = type === "AJUSTEMENT" && quantite.trim().startsWith("-") ? quantite.trim().slice(1) : quantite;
    const quantiteLue = lireQuantite(brute, { max: 1_000_000 });
    if (!quantiteLue.ok) {
      setErreurFormulaire(quantiteLue.message);
      return;
    }
    const quantiteNombre = type === "AJUSTEMENT" && quantite.trim().startsWith("-") ? -quantiteLue.valeur : quantiteLue.valeur;
    setEnEnvoi(true);
    setErreurFormulaire(null);
    try {
      await client.creerMouvementStock({
        produitId: produit.id,
        type,
        quantite: quantiteNombre,
        motif: motif.trim() || undefined,
      });
      setModaleOuverte(false);
      recharger();
    } catch (e) {
      setErreurFormulaire(messageErreur(e, "Le mouvement n'a pas pu être enregistré. Réessayez."));
    } finally {
      setEnEnvoi(false);
    }
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour
        titre="Stock"
        sousTitre="Mouvements de stock des produits."
        onRetour={onRetour}
      />

      {erreur && (
        <Text style={styles.erreur} accessibilityRole="alert">
          {erreur}
        </Text>
      )}
      {erreurProduits && (
        <Pressable onPress={rechargerProduits} accessibilityRole="button" accessibilityLabel="Réessayer de charger les produits" style={styles.zoneErreur}>
          <Text style={styles.erreur} accessibilityRole="alert">
            {erreurProduits} Touchez ici pour réessayer.
          </Text>
        </Pressable>
      )}

      <View style={styles.onglets}>
        <Pressable
          style={[styles.onglet, onglet === "mouvements" && styles.ongletActif]}
          onPress={() => setOnglet("mouvements")}
          accessibilityRole="tab"
          accessibilityLabel="Mouvements"
          accessibilityState={{ selected: onglet === "mouvements" }}
        >
          <Text style={[styles.ongletTexte, onglet === "mouvements" && styles.ongletTexteActif]}>Mouvements</Text>
        </Pressable>
        <Pressable
          style={[styles.onglet, onglet === "valeur" && styles.ongletActif]}
          onPress={() => setOnglet("valeur")}
          accessibilityRole="tab"
          accessibilityLabel="Valeur du stock"
          accessibilityState={{ selected: onglet === "valeur" }}
        >
          <Text style={[styles.ongletTexte, onglet === "valeur" && styles.ongletTexteActif]}>Valeur stock</Text>
        </Pressable>
      </View>

      {onglet === "valeur" && (
        <ScrollView contentContainerStyle={styles.liste} refreshControl={<RefreshControl refreshing={enCours} onRefresh={recharger} />}>
          {produitsActifs.length === 0 && (
            <View style={styles.videConteneur}>
              <TrendingUp size={32} color={couleurs.encreFaible} />
              <Text style={styles.videTitre}>Aucun produit actif.</Text>
            </View>
          )}
          {produitsActifs.map((p) => {
            const valeur = Number(p.prix) * Number(p.stockActuel);
            const cout = p.prixAchat ? Number(p.prixAchat) * Number(p.stockActuel) : null;
            return (
              <View key={p.id} style={styles.carte}>
                <View style={styles.carteEntete}>
                  <Text style={styles.nom}>{p.nom}</Text>
                  <Text style={styles.quantitePositive}>{formatMontant(String(valeur), p.devise)}</Text>
                </View>
                <Text style={styles.type}>{p.categorie} · Stock : {p.stockActuel}</Text>
                {cout !== null && (
                  <Text style={styles.motif}>Coût acq. : {formatMontant(String(cout), p.devise)}</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {onglet === "mouvements" && mouvements?.length === 0 && (
        <View style={styles.videConteneur}>
          <Package size={32} color={couleurs.encreFaible} />
          <Text style={styles.videTitre}>Aucun mouvement enregistré.</Text>
        </View>
      )}

      {onglet === "mouvements" && (
        <FlatList
          data={mouvements ?? []}
          keyExtractor={(m: MouvementStock) => m.id}
          contentContainerStyle={styles.liste}
          refreshControl={<RefreshControl refreshing={enCours} onRefresh={recharger} />}
          renderItem={({ item }) => {
            const negatif = item.type === "SORTIE_VENTE" || item.type === "PERTE" || Number(item.quantite) < 0;
            return (
              <View style={styles.carte}>
                <View style={styles.carteEntete}>
                  <Text style={styles.nom}>{item.produit.nom}</Text>
                  <Text style={[styles.quantite, negatif ? styles.quantiteNegative : styles.quantitePositive]}>
                    {negatif ? "" : "+"}
                    {item.quantite}
                  </Text>
                </View>
                <Text style={styles.type}>{LIBELLE_TYPE[item.type] ?? item.type}</Text>
                {item.motif && <Text style={styles.motif}>{item.motif}</Text>}
              </View>
            );
          }}
        />
      )}

      <FeuilleModale
        visible={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        titre="Enregistrer un mouvement"
        modifie={produit !== null || quantite.trim() !== "" || motif.trim() !== ""}
        enCours={enEnvoi}
      >
        <Text style={styles.label}>Produit</Text>
        <Pressable
          style={styles.champProduit}
          onPress={() => setSelecteurOuvert(true)}
          accessibilityRole="button"
          accessibilityLabel={produit ? `Produit : ${produit.nom}. Changer de produit` : "Choisir un produit"}
        >
          <Text style={produit ? styles.champProduitTexte : styles.champProduitPlaceholder}>
            {produit ? produit.nom : "Choisir un produit"}
          </Text>
        </Pressable>

        <Text style={styles.label}>Type</Text>
        <View style={styles.selecteurType}>
          {TYPES.map((t) => (
            <Pressable
              key={t.valeur}
              style={[styles.optionType, type === t.valeur && styles.optionTypeActive]}
              onPress={() => setType(t.valeur)}
              accessibilityRole="radio"
              accessibilityLabel={t.libelle}
              accessibilityState={{ checked: type === t.valeur }}
            >
              <Text style={[styles.optionTypeTexte, type === t.valeur && styles.optionTypeTexteActif]}>{t.libelle}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Quantité</Text>
        <TextInput
          style={styles.champ}
          value={quantite}
          onChangeText={setQuantite}
          accessibilityLabel="Quantité"
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={couleurs.encreFaible}
        />

        <Text style={styles.label}>Motif (optionnel)</Text>
        <TextInput
          style={styles.champ}
          value={motif}
          onChangeText={setMotif}
          accessibilityLabel="Motif du mouvement, optionnel"
          placeholder="Ex. livraison fournisseur"
          placeholderTextColor={couleurs.encreFaible}
        />

        {erreurFormulaire && (
          <Text style={styles.erreurFormulaire} accessibilityRole="alert">
            {erreurFormulaire}
          </Text>
        )}

        <Pressable
          style={styles.bouton}
          onPress={enregistrer}
          disabled={enEnvoi}
          accessibilityRole="button"
          accessibilityState={{ disabled: enEnvoi, busy: enEnvoi }}
        >
          <Text style={styles.boutonTexte}>{enEnvoi ? "…" : "Enregistrer"}</Text>
        </Pressable>
      </FeuilleModale>

      <SelecteurProduit
        visible={selecteurOuvert}
        produits={produitsActifs}
        onFermer={() => setSelecteurOuvert(false)}
        onChoisir={(p) => {
          setProduit(p);
          setSelecteurOuvert(false);
        }}
      />

      {/* FAB bas-droite — standard Android, sous le pouce. */}
      <BoutonAjouterFlottant onPress={ouvrirFormulaire} accessibilityLabel="Nouveau mouvement" />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
  zoneErreur: { minHeight: 44, justifyContent: "center" },
  onglets: { flexDirection: "row", marginHorizontal: espacements.s4, marginTop: espacements.s3, borderRadius: rayons.md, borderWidth: 1, borderColor: couleurs.bordure, overflow: "hidden" },
  onglet: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: couleurs.surface200 },
  ongletActif: { backgroundColor: couleurs.bleu },
  ongletTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  ongletTexteActif: { color: "#fff" },
  // 88px de marge basse : le FAB ne recouvre pas la dernière carte.
  liste: { padding: espacements.s4, paddingBottom: 88, gap: espacements.s3 },
  videConteneur: { alignItems: "center", padding: espacements.s7, gap: espacements.s2 },
  videTitre: { fontSize: 15, fontWeight: "600", color: couleurs.encre },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: 4,
  },
  carteEntete: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nom: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  quantite: { fontSize: 15, fontWeight: "700" },
  quantitePositive: { color: couleurs.succes },
  quantiteNegative: { color: couleurs.danger },
  type: { fontSize: 13, color: couleurs.encreAttenuee },
  motif: { fontSize: 12, color: couleurs.encreAttenuee, fontStyle: "italic" },

  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginBottom: espacements.s1 },
  champ: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    minHeight: 44,
    fontSize: 15,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
  },
  champProduit: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: couleurs.surface100,
  },
  champProduitTexte: { fontSize: 15, color: couleurs.encre, fontWeight: "600" },
  champProduitPlaceholder: { fontSize: 15, color: couleurs.encreFaible },
  selecteurType: { flexDirection: "row", gap: espacements.s2 },
  optionType: {
    flex: 1,
    minHeight: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTypeActive: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  optionTypeTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  optionTypeTexteActif: { color: "#fff" },
  erreurFormulaire: { color: couleurs.danger, fontSize: 13 },
  bouton: { minHeight: 44, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center", marginTop: espacements.s2 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
