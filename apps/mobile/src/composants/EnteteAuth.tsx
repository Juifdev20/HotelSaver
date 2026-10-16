import * as React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { couleurs } from "../tokens";

/** Bleu vif de « Saver » dans le nom de marque (maquette du 15/10/2026). */
const BLEU_SAVER = "#1A73E8";

/** En-tête de marque des écrans de connexion et d'inscription (maquette du
 * 15/10/2026, seconde version) : logo centré, « Hotel » navy + « Saver »
 * bleu, slogan dessous. Même composant, mêmes marges sur les deux pages : le
 * bloc logo + slogan ne bouge pas de l'une à l'autre. */
export function EnteteAuth() {
  return (
    <View style={styles.entete}>
      <StatusBar style="dark" />
      <Image source={require("../../assets/hotelsaver-logo-carre.png")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.nom}>
        Hotel<Text style={styles.saver}>Saver</Text>
      </Text>
      <Text style={styles.slogan}>La gestion hôtelière, en toute simplicité.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  entete: { alignItems: "center" },
  logo: { width: 82, height: 82 },
  nom: { fontSize: 30, fontWeight: "800", color: couleurs.navy, letterSpacing: -0.3, marginTop: 8, lineHeight: 36 },
  saver: { color: BLEU_SAVER },
  slogan: { fontSize: 14, color: "#5B6B8C", marginTop: 2 },
});
