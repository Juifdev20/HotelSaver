import * as React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Plus } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";

export interface BoutonAjouterFlottantProps {
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/**
 * Bouton « + » flottant bas-droite (FAB) — le placement standard des apps
 * Android, sous le pouce ; remplace les « + » d'en-tête (retour du patron
 * 28/09 : « le bouton ajout se retrouve en haut, c'est souvent en bas dans
 * les applications professionnelles »). Le bouton vit dans la zone de
 * contenu de l'écran, donc au-dessus de la barre d'onglets.
 */
export function BoutonAjouterFlottant({ onPress, disabled, accessibilityLabel }: BoutonAjouterFlottantProps) {
  return (
    <Pressable
      style={[styles.fab, disabled && styles.fabDesactive]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? "Ajouter"}
    >
      <Plus size={26} color="#fff" strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: espacements.s4,
    bottom: espacements.s4,
    width: 56,
    height: 56,
    borderRadius: rayons.pill,
    backgroundColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabDesactive: { opacity: 0.5 },
});
