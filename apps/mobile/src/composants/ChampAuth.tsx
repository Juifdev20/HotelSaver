import * as React from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { Check, Eye, EyeOff } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { couleurs } from "../tokens";

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
        <Icone size={20} color={couleurs.navy} strokeWidth={1.8} style={styles.icone} />
        <TextInput
          // Valeurs par défaut utiles (suggestion de l'email / du mot de passe, touche « Suivant »), l'appelant peut les remplacer.
          accessibilityLabel={suffixe ? `${libelle}, suivi de ${suffixe}` : libelle}
          autoComplete={secureTextEntry ? "current-password" : reste.keyboardType === "email-address" ? "email" : "off"}
          returnKeyType="next"
          {...reste}
          style={styles.saisie}
          secureTextEntry={secureTextEntry && !visible}
          placeholderTextColor="#8A97AD"
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
        />
        {suffixe && (
          <View style={styles.suffixe}>
            <Text style={styles.suffixeTexte}>{suffixe}</Text>
          </View>
        )}
        {valide && !secureTextEntry && (
          <View style={styles.coche} accessible accessibilityLabel="Valide">
            <Check size={12} color="#fff" strokeWidth={3} />
          </View>
        )}
        {secureTextEntry && (
          <Pressable
            style={styles.oeil}
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={visible ? `Masquer ${libelle.toLowerCase()}` : `Afficher ${libelle.toLowerCase()}`}
            accessibilityState={{ checked: visible }}
          >
            {visible ? <EyeOff size={20} color={couleurs.navy} strokeWidth={1.8} /> : <Eye size={20} color={couleurs.navy} strokeWidth={1.8} />}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Maquette connexion/inscription du 15/10/2026 : libellé navy gras, champ
  // blanc à bordure bleu-gris, icône navy au trait fin.
  groupe: { marginBottom: 10 },
  libelle: { fontSize: 13.5, fontWeight: "700", color: couleurs.navy, marginBottom: 5 },
  boite: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#D8E1EE",
    borderRadius: 12,
    backgroundColor: couleurs.surface200,
    overflow: "hidden",
  },
  boiteFocus: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  icone: { marginLeft: 16 },
  saisie: { flex: 1, height: "100%", paddingHorizontal: 14, fontSize: 14.5, color: couleurs.encre },
  suffixe: {
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#F3F6FB",
    borderLeftWidth: 1,
    borderLeftColor: "#D8E1EE",
  },
  suffixeTexte: { fontSize: 13, color: "#3B4A63" },
  coche: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: couleurs.succes,
    alignItems: "center",
    justifyContent: "center",
  },
  oeil: { width: 46, minWidth: 44, height: "100%", alignItems: "center", justifyContent: "center" },
});
