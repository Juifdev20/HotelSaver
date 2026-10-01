import * as React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import type { LigneRecu } from "@hotel-chicago/receipts";

const POLICE = Platform.select({ ios: "Menlo", default: "monospace" });

/**
 * Aperçu d'un reçu : le MÊME `LigneRecu[]` que celui envoyé à l'imprimante, affiché comme un ticket
 * (papier blanc, police à chasse fixe) — ce que la cafétaria voit est exactement ce qui sort imprimé.
 */
export function ApercuRecu({ lignes }: { lignes: LigneRecu[] }) {
  return (
    <View style={styles.papier} accessibilityLabel="Aperçu du reçu">
      {lignes.map((ligne, i) => {
        switch (ligne.type) {
          case "titre":
            return (
              <Text key={i} style={[styles.texte, styles.centre, styles.gras, styles.titre]}>
                {ligne.texte}
              </Text>
            );
          case "soustitre":
            return (
              <Text key={i} style={[styles.texte, styles.centre]}>
                {ligne.texte}
              </Text>
            );
          case "separateur":
            return <View key={i} style={styles.separateur} />;
          case "champ":
            return (
              <Text key={i} style={styles.texte}>
                {ligne.label} : {ligne.valeur}
              </Text>
            );
          case "montant":
            return (
              <View key={i} style={styles.ligneMontant}>
                <Text style={[styles.texte, styles.libelle]}>{ligne.libelle}</Text>
                <Text style={[styles.texte, styles.gras]}>{ligne.valeur}</Text>
              </View>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Toujours blanc sur noir, même en thème sombre : c'est du papier.
  papier: {
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D9DEE5",
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 3,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  texte: { fontFamily: POLICE, fontSize: 12.5, color: "#111111" },
  centre: { textAlign: "center" },
  gras: { fontWeight: "700" },
  titre: { fontSize: 14 },
  separateur: { borderTopWidth: 1, borderTopColor: "#111111", borderStyle: "dashed", marginVertical: 5 },
  ligneMontant: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  libelle: { flexShrink: 1 },
});
