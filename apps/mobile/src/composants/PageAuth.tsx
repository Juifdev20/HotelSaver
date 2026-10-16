import * as React from "react";
import { Platform, Pressable, StatusBar as StatusBarNative, StyleSheet, View, useWindowDimensions } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { couleurs } from "../tokens";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { ConteneurFormulaire } from "./ConteneurFormulaire";
import { EnteteAuth } from "./EnteteAuth";

const BLEU_PALE = "#EAF2FD";
const HAUTEUR_PIED = 96;

export interface PageAuthProps {
  children: React.ReactNode;
  /** Flèche de retour ronde en haut à gauche, à côté du logo (ex. étape 2 de
   * l'inscription → étape 1) — remplace un bouton « Retour » en bas de page,
   * pour que le formulaire tienne sans défiler (retour du patron, 15/10/2026). */
  onRetour?: () => void;
}

/**
 * Gabarit des écrans de connexion et d'inscription (maquette du 15/10/2026,
 * seconde version) : page blanche, quarts de cercle bleu pâle dans les deux
 * coins du haut, en-tête de marque centré (EnteteAuth, même position sur les
 * deux pages), contenu défilant, puis deux vagues bleu pâle en pied de page —
 * plus de photo. Le pied reste collé en bas quand le formulaire est court.
 *
 * Monté hors SafeAreaProvider (voir App.tsx) : la hauteur de la barre d'état
 * vient de `StatusBar.currentHeight` (edge-to-edge, le blanc passe dessous).
 */
export function PageAuth({ children, onRetour }: PageAuthProps) {
  const hauteurBarre = Platform.OS === "android" ? StatusBarNative.currentHeight ?? 24 : 48;
  const { width: largeur } = useWindowDimensions();

  return (
    <View style={styles.page}>
      {/* Coins bleu pâle coupés net SOUS la barre d'état (maquette) : le Svg
       * commence à `hauteurBarre`, les cercles centrés au-dessus de son bord
       * n'en montrent que la partie basse — jamais sous l'heure ni la batterie. */}
      <Svg style={[styles.formesHaut, { top: hauteurBarre }]} width={largeur} height={120} pointerEvents="none">
        <Circle cx={-6} cy={-20} r={92} fill={BLEU_PALE} />
        <Circle cx={largeur + 6} cy={-20} r={104} fill={BLEU_PALE} />
      </Svg>
      <ConteneurFormulaire styleContenu={styles.defilement}>
        <View style={[styles.contenu, { paddingTop: hauteurBarre + 14 }]}>
          <EnteteAuth />
          <View style={styles.corps}>{children}</View>
        </View>
        <PiedAuth largeur={largeur} />
      </ConteneurFormulaire>
      {onRetour && (
        <Pressable
          style={[styles.retour, { top: hauteurBarre + 14 }]}
          onPress={onRetour}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <ArrowLeft size={22} color={couleurs.bleu} />
        </Pressable>
      )}
    </View>
  );
}

/** Deux vagues superposées, la plus claire derrière (maquette). */
function PiedAuth({ largeur: L }: { largeur: number }) {
  const H = HAUTEUR_PIED;
  return (
    <View style={[styles.pied, { height: H }]} pointerEvents="none">
      <Svg width={L} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="vagueAvant" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#E3EEFC" />
            <Stop offset="1" stopColor="#C9DDFA" />
          </LinearGradient>
        </Defs>
        <Path
          d={`M0 ${H * 0.35} C ${L * 0.25} ${H * 0.1}, ${L * 0.45} ${H * 0.55}, ${L * 0.7} ${H * 0.4} C ${L * 0.85} ${H * 0.3}, ${L * 0.95} ${H * 0.15}, ${L} ${H * 0.2} L ${L} ${H} L 0 ${H} Z`}
          fill="#F1F6FE"
        />
        <Path
          d={`M0 ${H * 0.75} C ${L * 0.2} ${H * 0.5}, ${L * 0.45} ${H * 0.95}, ${L * 0.72} ${H * 0.62} C ${L * 0.85} ${H * 0.48}, ${L * 0.94} ${H * 0.45}, ${L} ${H * 0.5} L ${L} ${H} L 0 ${H} Z`}
          fill="url(#vagueAvant)"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFFFFF" },
  formesHaut: { position: "absolute", top: 0, left: 0 },
  retour: {
    position: "absolute",
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#0F2742",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  defilement: { padding: 0, paddingBottom: 0 },
  contenu: { paddingHorizontal: 26 },
  corps: { marginTop: 18 },
  pied: { marginTop: "auto", width: "100%" },
});
