import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { couleurs, espacements } from "../tokens";

export interface EnteteRetourProps {
  titre: string;
  sousTitre?: string;
  onRetour: () => void;
  /** Bouton d'action à droite (ex. "+" pour ajouter), optionnel. */
  action?: React.ReactNode;
}

/** En-tête "‹ Retour" + titre, partagé par tous les écrans atteints depuis
 * l'onglet "Plus" (Paramètres, Menu, Stock, Comptes ouverts, Caisse, détail
 * d'un compte) — CoquilleOnglets.tsx est un Tab.Navigator plat sans stack
 * imbriqué, donc pas de bouton "back" natif ; ces écrans gèrent leur retour
 * eux-mêmes via un état local dans EcranPlus.tsx. */
export function EnteteRetour({ titre, sousTitre, onRetour, action }: EnteteRetourProps) {
  return (
    <View style={styles.entete}>
      <View style={styles.texte}>
        <Pressable style={styles.boutonRetour} onPress={onRetour} hitSlop={8}>
          <ChevronLeft size={20} color={couleurs.encre} />
          <Text style={styles.boutonRetourTexte}>Retour</Text>
        </Pressable>
        <Text style={styles.titre}>{titre}</Text>
        {sousTitre && <Text style={styles.sousTitre}>{sousTitre}</Text>}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  entete: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: espacements.s4,
    paddingBottom: espacements.s2,
  },
  texte: { flex: 1, gap: 2 },
  boutonRetour: { flexDirection: "row", alignItems: "center", marginBottom: espacements.s1 },
  boutonRetourTexte: { fontSize: 14, fontWeight: "600", color: couleurs.encre },
  titre: { fontSize: 22, fontWeight: "700", color: couleurs.navy },
  sousTitre: { fontSize: 13, color: couleurs.encreAttenuee },
});
