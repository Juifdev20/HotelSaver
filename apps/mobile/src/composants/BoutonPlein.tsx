import * as React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { couleurs, espacements, rayons } from "../tokens";

export interface BoutonPleinProps {
  libelle: string;
  onPress: () => void;
  variante?: "principal" | "secondaire" | "danger" | "succes";
  desactive?: boolean;
  /** Envoi en cours : le bouton montre un indicateur et ne répond plus. */
  occupe?: boolean;
  icone?: React.ReactNode;
  /** Phrase lue par le lecteur d'écran si elle doit être plus précise que le libellé. */
  libelleAccessible?: string;
}

/** Bouton large (≥ 48 px de haut) pour les écrans de formulaire : texte blanc sur fond plein, ou contour pour l'action secondaire. */
export function BoutonPlein({ libelle, onPress, variante = "principal", desactive = false, occupe = false, icone, libelleAccessible }: BoutonPleinProps) {
  const inactif = desactive || occupe;
  const secondaire = variante === "secondaire";
  return (
    <Pressable
      style={[styles.bouton, styles[variante], inactif && styles.inactif]}
      onPress={onPress}
      disabled={inactif}
      accessibilityRole="button"
      accessibilityLabel={libelleAccessible ?? libelle}
      accessibilityState={{ disabled: inactif, busy: occupe }}
    >
      {occupe ? (
        <ActivityIndicator color={secondaire ? couleurs.bleu : "#fff"} />
      ) : (
        <>
          {icone}
          <Text style={[styles.texte, secondaire && styles.texteSecondaire]}>{libelle}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bouton: {
    flexDirection: "row",
    minHeight: 48,
    borderRadius: rayons.md,
    alignItems: "center",
    justifyContent: "center",
    gap: espacements.s2,
    paddingHorizontal: espacements.s4,
    paddingVertical: espacements.s2,
  },
  principal: { backgroundColor: couleurs.bleu },
  secondaire: { backgroundColor: couleurs.surface200, borderWidth: 1, borderColor: couleurs.bleu },
  danger: { backgroundColor: couleurs.danger },
  succes: { backgroundColor: couleurs.succes },
  inactif: { opacity: 0.5 },
  texte: { color: "#fff", fontSize: 15, fontWeight: "700", textAlign: "center", flexShrink: 1 },
  texteSecondaire: { color: couleurs.bleu },
});
