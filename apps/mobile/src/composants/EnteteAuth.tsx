import * as React from "react";
import { Image, Platform, StatusBar as StatusBarNative, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { couleurs, espacements } from "../tokens";

/** Bandeau navy du haut des écrans de connexion/inscription (maquette : logo +
 * nom sur fond navy, feuille blanche arrondie dessous). Il remonte jusqu'en
 * haut de l'écran — edge-to-edge : l'horloge, le réseau et la batterie sont
 * dessinés par-dessus, donc icônes claires et même navy que l'app.
 * Ces écrans sont montés hors SafeAreaProvider : la hauteur de la barre
 * d'état vient de `StatusBar.currentHeight`. */
export function EnteteAuth() {
  const hauteurBarre = Platform.OS === "android" ? StatusBarNative.currentHeight ?? 24 : 48;
  return (
    <View style={[styles.bandeau, { paddingTop: hauteurBarre + espacements.s3 }]}>
      <StatusBar style="light" />
      <Image source={require("../../assets/hotelsaver-logo.png")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.nom}>HotelSaver</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bandeau: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s2,
    paddingHorizontal: espacements.s4,
    paddingBottom: espacements.s5 + espacements.s3,
    backgroundColor: couleurs.navy,
  },
  logo: { width: 30, height: 30, borderRadius: 8 },
  nom: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
