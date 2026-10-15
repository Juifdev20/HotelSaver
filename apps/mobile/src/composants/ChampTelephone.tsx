import * as React from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Path, Polygon, Rect } from "react-native-svg";
import { Check, ChevronDown } from "lucide-react-native";
import { INDICATIF_RDC, formaterSaisieRdc, normaliserTelephoneRdc } from "@hotel-chicago/types";
import { couleurs } from "../tokens";
import { FeuilleModale } from "./FeuilleModale";

/** Numéro normalisé (« +243XXXXXXXXX ») à partir de la saisie du champ, ou null. */
export function telephoneDepuisSaisie(saisie: string): string | null {
  return normaliserTelephoneRdc(`${INDICATIF_RDC}${saisie.replace(/\D/g, "").replace(/^0/, "")}`);
}

/** Étoile à 5 branches (drapeau RDC), centre (cx, cy), rayons R et r. */
function pointsEtoile(cx: number, cy: number, R: number, r: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const rayon = i % 2 === 0 ? R : r;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(cx + rayon * Math.cos(angle)).toFixed(1)},${(cy + rayon * Math.sin(angle)).toFixed(1)}`;
  }).join(" ");
}

/** Drapeau de la RDC : bleu ciel, étoile jaune, diagonale rouge bordée de jaune. */
export function DrapeauRdc({ largeur = 26 }: { largeur?: number }) {
  return (
    <Svg width={largeur} height={(largeur * 3) / 4} viewBox="0 0 800 600">
      <Rect width="800" height="600" fill="#007FFF" />
      <Path d="M0 450 L600 0 L800 0 L800 150 L200 600 L0 600 Z" fill="#F7D618" />
      <Path d="M0 525 L700 0 L800 0 L800 75 L100 600 L0 600 Z" fill="#CE1021" />
      <Polygon points={pointsEtoile(140, 125, 100, 40)} fill="#F7D618" />
    </Svg>
  );
}

export interface ChampTelephoneProps {
  libelle: string;
  /** Saisie formatée « 970 000 000 » (sans l'indicatif). */
  value: string;
  onChangeText: (saisie: string) => void;
  placeholder?: string;
}

/**
 * Champ « Numéro de téléphone » de la maquette du 15/10/2026 : drapeau RDC +
 * chevron, « +243 » + chevron, séparateur, saisie formatée par groupes de
 * trois chiffres. Un seul pays pour l'instant : toucher le drapeau ouvre la
 * liste des pays (RDC, cochée). Coche verte quand le numéro est valide
 * (9 chiffres commençant par 8 ou 9).
 */
export function ChampTelephone({ libelle, value, onChangeText, placeholder = "Numéro de téléphone" }: ChampTelephoneProps) {
  const [focus, setFocus] = useState(false);
  const [listePays, setListePays] = useState(false);
  const valide = telephoneDepuisSaisie(value) !== null;

  return (
    <View style={styles.groupe}>
      <Text style={styles.libelle}>{libelle}</Text>
      <View style={[styles.boite, focus && styles.boiteFocus]}>
        <Pressable
          style={styles.pays}
          onPress={() => setListePays(true)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Pays : République démocratique du Congo"
        >
          <DrapeauRdc />
          <ChevronDown size={14} color={couleurs.navy} />
          <Text style={styles.indicatif}>{INDICATIF_RDC}</Text>
          <ChevronDown size={14} color={couleurs.navy} />
        </Pressable>
        <View style={styles.separateur} />
        <TextInput
          style={styles.saisie}
          value={value}
          onChangeText={(texte) => onChangeText(formaterSaisieRdc(texte))}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          maxLength={11}
          placeholder={placeholder}
          placeholderTextColor="#8A97AD"
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
        />
        {valide && (
          <View style={styles.coche}>
            <Check size={12} color="#fff" strokeWidth={3} />
          </View>
        )}
      </View>

      <FeuilleModale visible={listePays} onFermer={() => setListePays(false)} titre="Pays">
        <Pressable style={styles.lignePays} onPress={() => setListePays(false)}>
          <DrapeauRdc largeur={30} />
          <Text style={styles.nomPays}>République démocratique du Congo</Text>
          <Text style={styles.indicatifListe}>{INDICATIF_RDC}</Text>
          <Check size={18} color={couleurs.bleu} />
        </Pressable>
      </FeuilleModale>
    </View>
  );
}

const styles = StyleSheet.create({
  groupe: { marginBottom: 10 },
  libelle: { fontSize: 13.5, fontWeight: "700", color: couleurs.navy, marginBottom: 5 },
  boite: {
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderWidth: 1,
    borderColor: "#D8E1EE",
    borderRadius: 12,
    backgroundColor: couleurs.surface200,
    overflow: "hidden",
  },
  boiteFocus: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  pays: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 14, paddingRight: 10, height: "100%" },
  indicatif: { fontSize: 14.5, color: couleurs.navy, marginLeft: 8 },
  separateur: { width: 1, height: 24, backgroundColor: "#D8E1EE" },
  saisie: { flex: 1, height: "100%", paddingHorizontal: 12, fontSize: 14.5, color: couleurs.encre },
  coche: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: couleurs.succes,
    alignItems: "center",
    justifyContent: "center",
  },
  lignePays: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
  nomPays: { flex: 1, fontSize: 15, color: couleurs.encre },
  indicatifListe: { fontSize: 15, color: couleurs.encreAttenuee },
});
