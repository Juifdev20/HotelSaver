import * as React from "react";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Devise, Produit, Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { UtensilsCrossed } from "lucide-react-native";
import { BoutonAjouterFlottant } from "../composants/BoutonAjouterFlottant";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { FeuilleModale } from "../composants/FeuilleModale";
import { useDonnee } from "../hooks/useDonnee";

export interface EcranMenuProps {
  client: ClientApi;
  utilisateur: UtilisateurAuthentifie;
  onRetour: () => void;
}

interface FormulaireProduit {
  nom: string;
  categorie: string;
  prix: string;
  devise: Devise;
  seuilAlerte: string;
  actif: boolean;
}

const FORMULAIRE_VIDE: FormulaireProduit = {
  nom: "",
  categorie: "",
  prix: "",
  devise: Devise.USD,
  seuilAlerte: "",
  actif: true,
};

/** Menu cafétaria — CAFETARIA en lecture seule, PATRON gère (créer/modifier/
 * supprimer), même matrice que ProduitsController côté API. */
export function EcranMenu({ client, utilisateur, onRetour }: EcranMenuProps) {
  const peutModifier = utilisateur.role === Role.PATRON;
  const { donnee: produits, erreur, enCours, recharger } = useDonnee(() => client.listerProduits(), client);

  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [produitEnEdition, setProduitEnEdition] = useState<Produit | null>(null);
  const [formulaire, setFormulaire] = useState<FormulaireProduit>(FORMULAIRE_VIDE);
  const [enEnvoi, setEnEnvoi] = useState(false);
  const [erreurFormulaire, setErreurFormulaire] = useState<string | null>(null);

  function ouvrirCreation() {
    setProduitEnEdition(null);
    setFormulaire(FORMULAIRE_VIDE);
    setErreurFormulaire(null);
    setModaleOuverte(true);
  }

  function ouvrirEdition(produit: Produit) {
    setProduitEnEdition(produit);
    setFormulaire({
      nom: produit.nom,
      categorie: produit.categorie,
      prix: produit.prix,
      devise: produit.devise,
      seuilAlerte: produit.seuilAlerte,
      actif: produit.actif,
    });
    setErreurFormulaire(null);
    setModaleOuverte(true);
  }

  async function enregistrer() {
    const prixNombre = Number(formulaire.prix);
    if (!formulaire.nom.trim() || !formulaire.categorie.trim() || !Number.isFinite(prixNombre) || prixNombre <= 0) {
      setErreurFormulaire("Nom, catégorie et prix (positif) sont obligatoires.");
      return;
    }
    setEnEnvoi(true);
    setErreurFormulaire(null);
    try {
      const seuilAlerte = formulaire.seuilAlerte.trim() ? Number(formulaire.seuilAlerte) : undefined;
      if (produitEnEdition) {
        await client.modifierProduit(produitEnEdition.id, {
          nom: formulaire.nom.trim(),
          categorie: formulaire.categorie.trim(),
          prix: prixNombre,
          devise: formulaire.devise,
          seuilAlerte,
          actif: formulaire.actif,
        });
      } else {
        await client.creerProduit({
          nom: formulaire.nom.trim(),
          categorie: formulaire.categorie.trim(),
          prix: prixNombre,
          devise: formulaire.devise,
          seuilAlerte,
        });
      }
      setModaleOuverte(false);
      recharger();
    } catch (e) {
      setErreurFormulaire(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  async function supprimer() {
    if (!produitEnEdition) return;
    setEnEnvoi(true);
    setErreurFormulaire(null);
    try {
      await client.supprimerProduit(produitEnEdition.id);
      setModaleOuverte(false);
      recharger();
    } catch (e) {
      setErreurFormulaire(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour
        titre="Menu"
        sousTitre={peutModifier ? "Gérez les produits en vente." : "Seul le Patron peut modifier le menu."}
        onRetour={onRetour}
      />

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {produits?.length === 0 && (
        <View style={styles.videConteneur}>
          <UtensilsCrossed size={32} color={couleurs.encreFaible} />
          <Text style={styles.videTitre}>Aucun produit enregistré.</Text>
        </View>
      )}

      <FlatList
        data={produits ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.liste}
        refreshControl={<RefreshControl refreshing={enCours} onRefresh={recharger} />}
        renderItem={({ item }) => (
          <Pressable
            style={styles.carte}
            onPress={() => peutModifier && ouvrirEdition(item)}
            disabled={!peutModifier}
          >
            <View style={styles.carteEntete}>
              <Text style={styles.nom}>{item.nom}</Text>
              {!item.actif && (
                <View style={styles.badgeInactif}>
                  <Text style={styles.badgeInactifTexte}>Inactif</Text>
                </View>
              )}
            </View>
            <Text style={styles.categorie}>{item.categorie}</Text>
            <View style={styles.carteBas}>
              <Text style={styles.prix}>{formatMontant(item.prix, item.devise)}</Text>
              <Text style={styles.stock}>Stock : {item.stockActuel}</Text>
            </View>
          </Pressable>
        )}
      />

      <FeuilleModale
        visible={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        titre={produitEnEdition ? "Modifier le produit" : "Nouveau produit"}
      >
        <Text style={styles.label}>Nom</Text>
        <TextInput
          style={styles.champ}
          value={formulaire.nom}
          onChangeText={(v) => setFormulaire((f) => ({ ...f, nom: v }))}
          placeholder="Coca-Cola"
          placeholderTextColor={couleurs.encreFaible}
        />

        <Text style={styles.label}>Catégorie</Text>
        <TextInput
          style={styles.champ}
          value={formulaire.categorie}
          onChangeText={(v) => setFormulaire((f) => ({ ...f, categorie: v }))}
          placeholder="Boissons"
          placeholderTextColor={couleurs.encreFaible}
        />

        <View style={styles.ligneChamps}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Prix</Text>
            <TextInput
              style={styles.champ}
              value={formulaire.prix}
              onChangeText={(v) => setFormulaire((f) => ({ ...f, prix: v }))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={couleurs.encreFaible}
            />
          </View>
          <View style={styles.selecteurDevise}>
            {[Devise.USD, Devise.CDF].map((d) => (
              <Pressable
                key={d}
                style={[styles.optionDevise, formulaire.devise === d && styles.optionDeviseActive]}
                onPress={() => setFormulaire((f) => ({ ...f, devise: d }))}
              >
                <Text style={[styles.optionDeviseTexte, formulaire.devise === d && styles.optionDeviseTexteActif]}>
                  {d}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.label}>Seuil d'alerte (optionnel)</Text>
        <TextInput
          style={styles.champ}
          value={formulaire.seuilAlerte}
          onChangeText={(v) => setFormulaire((f) => ({ ...f, seuilAlerte: v }))}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={couleurs.encreFaible}
        />

        {produitEnEdition && (
          <View style={styles.ligneSwitch}>
            <Text style={styles.label}>Actif à la vente</Text>
            <Switch value={formulaire.actif} onValueChange={(v) => setFormulaire((f) => ({ ...f, actif: v }))} />
          </View>
        )}

        {erreurFormulaire && <Text style={styles.erreurFormulaire}>{erreurFormulaire}</Text>}

        <View style={styles.boutonsModale}>
          {produitEnEdition && (
            <Pressable style={styles.boutonDanger} onPress={supprimer} disabled={enEnvoi}>
              <Text style={styles.boutonDangerTexte}>Supprimer</Text>
            </Pressable>
          )}
          <Pressable style={styles.bouton} onPress={enregistrer} disabled={enEnvoi}>
            <Text style={styles.boutonTexte}>{enEnvoi ? "…" : "Enregistrer"}</Text>
          </Pressable>
        </View>
      </FeuilleModale>

      {/* FAB bas-droite — modification réservée au PATRON (comme avant). */}
      {peutModifier && <BoutonAjouterFlottant onPress={ouvrirCreation} accessibilityLabel="Nouveau produit" />}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
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
  nom: { fontSize: 16, fontWeight: "700", color: couleurs.encre },
  badgeInactif: { backgroundColor: couleurs.dangerClair, borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 2 },
  badgeInactifTexte: { fontSize: 10, fontWeight: "700", color: couleurs.danger },
  categorie: { fontSize: 13, color: couleurs.encreAttenuee },
  carteBas: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  prix: { fontSize: 16, fontWeight: "700", color: couleurs.encre },
  stock: { fontSize: 13, color: couleurs.encreAttenuee },

  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginBottom: espacements.s1 },
  champ: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    height: 44,
    fontSize: 15,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
  },
  ligneChamps: { flexDirection: "row", gap: espacements.s3, alignItems: "flex-end" },
  selecteurDevise: { flexDirection: "row", borderRadius: rayons.sm, overflow: "hidden", borderWidth: 1, borderColor: couleurs.bordure },
  optionDevise: { paddingHorizontal: espacements.s3, height: 44, alignItems: "center", justifyContent: "center" },
  optionDeviseActive: { backgroundColor: couleurs.bleu },
  optionDeviseTexte: { fontSize: 13, fontWeight: "700", color: couleurs.encre },
  optionDeviseTexteActif: { color: "#fff" },
  ligneSwitch: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  erreurFormulaire: { color: couleurs.danger, fontSize: 13 },
  boutonsModale: { flexDirection: "row", gap: espacements.s3, marginTop: espacements.s2 },
  boutonDanger: {
    flex: 1,
    height: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonDangerTexte: { color: couleurs.danger, fontWeight: "700", fontSize: 14 },
  bouton: { flex: 1, height: 44, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
