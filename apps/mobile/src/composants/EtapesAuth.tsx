import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import { couleurs } from "../tokens";

/** Stepper « 1 — 2 » de l'inscription (maquette du 15/10/2026 : Votre hôtel /
 * Vos coordonnées). Pastilles aux deux bouts, trait fin entre elles ; l'étape
 * active est pleine bleue, l'autre bleu pâle. */
export function EtapesAuth({ etape }: { etape: 1 | 2 }) {
  const pastille = (n: 1 | 2, libelle: string) => {
    const actif = etape >= n;
    return (
      <View style={styles.item} accessibilityLabel={`${libelle}${etape === n ? ", étape en cours" : ""}`}>
        <View style={[styles.pastille, actif && styles.pastilleActive]}>
          <Text style={[styles.numero, actif && styles.numeroActif]}>{n}</Text>
        </View>
        <Text style={[styles.libelle, etape === n && styles.libelleActif]}>{libelle}</Text>
      </View>
    );
  };

  return (
    <View style={styles.ligne}>
      {/* Trait de progression : à moitié bleu à l'étape 1, plein à l'étape 2 (maquette). */}
      <View style={styles.trait}>
        <View style={[styles.traitActif, { width: etape === 2 ? "100%" : "45%" }]} />
      </View>
      {pastille(1, "Votre hôtel")}
      {pastille(2, "Vos coordonnées")}
    </View>
  );
}

const TAILLE = 32;

const styles = StyleSheet.create({
  ligne: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  item: { alignItems: "center", width: 124, gap: 6 },
  pastille: {
    width: TAILLE,
    height: TAILLE,
    borderRadius: TAILLE / 2,
    backgroundColor: "#E6EEFA",
    alignItems: "center",
    justifyContent: "center",
  },
  pastilleActive: { backgroundColor: couleurs.bleu },
  numero: { fontWeight: "700", fontSize: 15, color: "#3B4A63" },
  numeroActif: { color: "#fff" },
  libelle: { fontSize: 13, color: "#5B6B8C" },
  libelleActif: { color: couleurs.bleu, fontWeight: "600" },
  // Trait entre les centres des deux pastilles (largeur d'item / 2 de chaque côté).
  trait: { position: "absolute", left: 62 + TAILLE / 2 + 6, right: 62 + TAILLE / 2 + 6, top: TAILLE / 2 - 1, height: 2, backgroundColor: "#D6E2F3" },
  traitActif: { height: "100%", backgroundColor: couleurs.bleu },
});
