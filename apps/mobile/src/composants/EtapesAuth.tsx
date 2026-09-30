import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import { couleurs, espacements } from "../tokens";

/** Stepper « 1 — 2 » de l'inscription (maquette : Votre hôtel / Vos coordonnées). */
export function EtapesAuth({ etape }: { etape: 1 | 2 }) {
  const pastille = (n: 1 | 2, libelle: string) => {
    const actif = etape >= n;
    return (
      <View style={styles.item} accessibilityLabel={`${libelle}${etape === n ? ", étape en cours" : ""}`}>
        <View style={[styles.pastille, actif && styles.pastilleActive]}>
          <Text style={[styles.numero, actif && styles.numeroActif]}>{n}</Text>
        </View>
        <Text style={[styles.libelle, actif && styles.libelleActif]}>{libelle}</Text>
      </View>
    );
  };

  return (
    <View style={styles.ligne}>
      {pastille(1, "Votre hôtel")}
      <View style={[styles.trait, etape === 2 && styles.traitActif]} />
      {pastille(2, "Vos coordonnées")}
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", marginBottom: espacements.s4 },
  item: { alignItems: "center", width: 110, gap: 6 },
  pastille: { width: 30, height: 30, borderRadius: 15, backgroundColor: couleurs.bordure, alignItems: "center", justifyContent: "center" },
  pastilleActive: { backgroundColor: couleurs.bleu },
  numero: { fontWeight: "700", color: couleurs.encreAttenuee },
  numeroActif: { color: "#fff" },
  libelle: { fontSize: 12, fontWeight: "600", color: couleurs.encreFaible },
  libelleActif: { color: couleurs.navy },
  trait: { flex: 1, maxWidth: 60, height: 2, marginTop: 14, backgroundColor: couleurs.bordure },
  traitActif: { backgroundColor: couleurs.bleu },
});
