import * as React from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { Check, Eye, EyeOff } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";

export interface ChampAuthProps extends Omit<TextInputProps, "style"> {
  libelle: string;
  icone: LucideIcon;
  /** Coche verte quand la valeur est valide. */
  valide?: boolean;
  /** Texte collé à droite du champ (ex. « .hotelsaver.com »). */
  suffixe?: string;
}

/** Champ avec icône à gauche, coche de validation, et œil pour un mot de
 * passe (`secureTextEntry`) — comme la maquette connexion/inscription. */
export function ChampAuth({ libelle, icone: Icone, valide, suffixe, secureTextEntry, ...reste }: ChampAuthProps) {
  const [visible, setVisible] = useState(false);
  const [focus, setFocus] = useState(false);

  return (
    <View style={styles.groupe}>
      <Text style={styles.libelle}>{libelle}</Text>
      <View style={[styles.boite, focus && styles.boiteFocus]}>
        <Icone size={18} color={couleurs.encreFaible} style={styles.icone} />
        <TextInput
          {...reste}
          style={styles.saisie}
          secureTextEntry={secureTextEntry && !visible}
          placeholderTextColor={couleurs.encreFaible}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
        />
        {suffixe && (
          <View style={styles.suffixe}>
            <Text style={styles.suffixeTexte}>{suffixe}</Text>
          </View>
        )}
        {valide && !secureTextEntry && (
          <View style={styles.coche}>
            <Check size={12} color="#fff" strokeWidth={3} />
          </View>
        )}
        {secureTextEntry && (
          <Pressable
            style={styles.oeil}
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={visible ? "Masquer la saisie" : "Afficher la saisie"}
          >
            {visible ? <EyeOff size={18} color={couleurs.encreAttenuee} /> : <Eye size={18} color={couleurs.encreAttenuee} />}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  groupe: { marginBottom: espacements.s3 },
  libelle: { fontSize: 13, fontWeight: "600", color: couleurs.navy, marginBottom: 6 },
  boite: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.md,
    backgroundColor: couleurs.surface200,
    overflow: "hidden",
  },
  boiteFocus: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  icone: { marginLeft: 14 },
  saisie: { flex: 1, height: "100%", paddingHorizontal: 12, fontSize: 15, color: couleurs.encre },
  suffixe: {
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: 10,
    backgroundColor: couleurs.surface100,
    borderLeftWidth: 1,
    borderLeftColor: couleurs.bordure,
  },
  suffixeTexte: { fontSize: 12, color: couleurs.encreAttenuee },
  coche: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: couleurs.succes,
    alignItems: "center",
    justifyContent: "center",
  },
  oeil: { width: 46, height: "100%", alignItems: "center", justifyContent: "center" },
});
