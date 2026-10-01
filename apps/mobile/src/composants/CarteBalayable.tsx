import * as React from "react";
import { useRef } from "react";
import { Animated, PanResponder, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";

/**
 * Carte qu'on écarte d'un balayage vers la DROITE : un fond vert avec une coche apparaît derrière,
 * et au-delà d'un tiers de la largeur (ou d'un geste vif) la carte glisse hors de l'écran puis
 * `onMasquer` est appelé ; un geste trop court la ramène en place. Le geste ne s'active que pour un
 * mouvement surtout horizontal : le défilement vertical de la liste n'est pas gêné. Pas de dépendance
 * ajoutée (PanResponder + Animated de React Native).
 */
export function CarteBalayable({ children, onMasquer, libelle = "Masquer" }: { children: React.ReactNode; onMasquer: () => void; libelle?: string }) {
  const decalage = useRef(new Animated.Value(0)).current;
  const largeur = useRef(300);
  const surMasquer = useRef(onMasquer);
  surMasquer.current = onMasquer;

  const reculer = () => Animated.spring(decalage, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();

  const geste = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderMove: (_, g) => decalage.setValue(Math.max(0, g.dx)),
      onPanResponderRelease: (_, g) => {
        if (g.dx > largeur.current * 0.35 || g.vx > 0.9) {
          Animated.timing(decalage, { toValue: largeur.current, duration: 180, useNativeDriver: true }).start(() => surMasquer.current());
        } else {
          reculer();
        }
      },
      onPanResponderTerminate: reculer,
    })
  ).current;

  return (
    <View
      onLayout={(e) => {
        largeur.current = e.nativeEvent.layout.width;
      }}
      accessible
      accessibilityActions={[{ name: "activate", label: libelle }]}
      onAccessibilityAction={() => surMasquer.current()}
    >
      <View style={styles.fond} pointerEvents="none">
        <Check size={20} color="#fff" />
        <Text style={styles.fondTexte}>{libelle}</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX: decalage }] }} {...geste.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fond: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s2,
    paddingLeft: espacements.s4,
    borderRadius: rayons.lg,
    backgroundColor: couleurs.succes,
  },
  fondTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
