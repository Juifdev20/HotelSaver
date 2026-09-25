import * as React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Produit } from "@hotel-chicago/types";
import { couleurs, espacements } from "../tokens";
import { formatMontant } from "../formatMontant";
import { FeuilleModale } from "./FeuilleModale";

export interface SelecteurProduitProps {
  visible: boolean;
  produits: Produit[];
  onChoisir: (produit: Produit) => void;
  onFermer: () => void;
}

/** Liste de choix d'un produit, utilisée par le formulaire Stock (tout
 * produit) et par "Ajouter une ligne" dans un compte cafétaria (produits
 * actifs seulement — filtré par l'appelant, ce composant reste générique). */
export function SelecteurProduit({ visible, produits, onChoisir, onFermer }: SelecteurProduitProps) {
  return (
    <FeuilleModale visible={visible} onFermer={onFermer} titre="Choisir un produit" avecDefilement={false}>
      {produits.length === 0 ? (
        <Text style={styles.vide}>Aucun produit disponible.</Text>
      ) : (
        <FlatList
          data={produits}
          keyExtractor={(p) => p.id}
          style={styles.liste}
          ItemSeparatorComponent={() => <View style={styles.separateur} />}
          renderItem={({ item }) => (
            <Pressable style={styles.ligne} onPress={() => onChoisir(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nom}>{item.nom}</Text>
                <Text style={styles.categorie}>{item.categorie}</Text>
              </View>
              <Text style={styles.prix}>{formatMontant(item.prix, item.devise)}</Text>
            </Pressable>
          )}
        />
      )}
    </FeuilleModale>
  );
}

const styles = StyleSheet.create({
  liste: { maxHeight: 360 },
  separateur: { height: 1, backgroundColor: couleurs.bordure },
  ligne: { flexDirection: "row", alignItems: "center", paddingVertical: espacements.s3, gap: espacements.s3 },
  nom: { fontSize: 15, fontWeight: "600", color: couleurs.encre },
  categorie: { fontSize: 12, color: couleurs.encreAttenuee, marginTop: 2 },
  prix: { fontSize: 14, fontWeight: "700", color: couleurs.encre },
  vide: { fontSize: 14, color: couleurs.encreAttenuee, textAlign: "center", paddingVertical: espacements.s4 },
});
