import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Hammer } from "lucide-react-native";
import { couleurs, espacements } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";

/** Écran prévu mais pas encore construit — même principe que le desktop
 * (`apps/desktop/src/renderer/src/screens/EcranBientot.tsx`) : on le dit
 * clairement plutôt que d'afficher un onglet muet ou une page vide. */
export function EcranBientot({ titre }: { titre: string }) {
  return (
    <View style={styles.page}>
      <EnteteMobile />
      <View style={styles.centre}>
        <Hammer size={32} color={couleurs.encreFaible} />
        <Text style={styles.titre}>{titre}</Text>
        <Text style={styles.texte}>Cet écran arrive bientôt.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", gap: espacements.s2, padding: espacements.s5 },
  titre: { fontSize: 17, fontWeight: "700", color: couleurs.encre },
  texte: { fontSize: 14, color: couleurs.encreAttenuee, textAlign: "center" },
});
