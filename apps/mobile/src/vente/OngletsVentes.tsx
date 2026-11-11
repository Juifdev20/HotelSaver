import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ShoppingCart, Table2 } from "lucide-react-native";
import { couleurs, espacements } from "../tokens";

export interface OngletVente {
  id: string;
  titre: string;
  sousTitre: string;
  /** « Nouvelle vente » : icône de panier ; les autres sont des tables. */
  nouvelle?: boolean;
  /** Une part de la table est déjà payée. */
  paye?: boolean;
}

/**
 * Onglets des ventes en cours, comme les onglets d'un navigateur : « Nouvelle vente » puis une table par client resté. Un tap passe de l'une à l'autre ;
 * les produits choisis de chacune sont gardés.
 */
export function OngletsVentes({ onglets, actif, onChoisir }: { onglets: OngletVente[]; actif: string; onChoisir: (id: string) => void }) {
  return (
    <View style={styles.cadre}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contenu} accessibilityRole="tablist">
        {onglets.map((o) => {
          const a = o.id === actif;
          const Icone = o.nouvelle ? ShoppingCart : Table2;
          return (
            <Pressable
              key={o.id}
              onPress={() => onChoisir(o.id)}
              style={[styles.onglet, a && styles.ongletActif]}
              accessibilityRole="tab"
              accessibilityState={{ selected: a }}
              accessibilityLabel={`${o.titre}, ${o.sousTitre}`}
            >
              <View style={styles.ligne}>
                <Icone size={15} color={a ? couleurs.bleu : couleurs.encreAttenuee} />
                <Text style={[styles.titre, a && styles.titreActif]} numberOfLines={1}>
                  {o.titre}
                </Text>
                {o.paye && (
                  <View style={styles.puce}>
                    <Text style={styles.puceTexte}>payé</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.sous, a && { color: couleurs.bleu }]} numberOfLines={1}>
                {o.sousTitre}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: { borderBottomWidth: 1, borderBottomColor: couleurs.bordure, marginBottom: espacements.s3 },
  contenu: { paddingHorizontal: espacements.s4, gap: 6, alignItems: "flex-end" },
  onglet: { paddingHorizontal: 13, paddingTop: 8, paddingBottom: 9, borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomWidth: 3, borderBottomColor: "transparent", minHeight: 48, justifyContent: "center", maxWidth: 190 },
  ongletActif: { backgroundColor: couleurs.surface200, borderBottomColor: couleurs.bleu },
  ligne: { flexDirection: "row", alignItems: "center", gap: 6 },
  titre: { fontSize: 13.5, fontWeight: "600", color: couleurs.encreAttenuee, flexShrink: 1 },
  titreActif: { fontWeight: "800", color: couleurs.encre },
  sous: { fontSize: 11, fontWeight: "600", color: couleurs.encreAttenuee, marginTop: 1 },
  puce: { backgroundColor: couleurs.succesClair, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  puceTexte: { fontSize: 10, fontWeight: "800", color: couleurs.succes },
});
