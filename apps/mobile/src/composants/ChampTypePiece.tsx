import * as React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { TYPE_PIECE_AUTRE, TYPES_PIECE_IDENTITE, typePieceDeLaListe } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";

export interface ChampTypePieceProps {
  /** Texte enregistré (libellé de la liste, ou texte libre pour une pièce hors liste). */
  valeur: string;
  onChange: (valeur: string) => void;
  libelle?: string;
}

/**
 * Choix de la pièce d'identité en un toucher (carte d'électeur, passeport, visa…), les plus courantes d'abord ; « Autre » laisse écrire une pièce
 * qui n'est pas dans la liste. Une ancienne saisie libre reconnue (« CNI ») est retrouvée dans la liste.
 */
export function ChampTypePiece({ valeur, onChange, libelle = "Type de pièce (optionnel)" }: ChampTypePieceProps) {
  const [autre, setAutre] = React.useState(() => valeur.trim() !== "" && typePieceDeLaListe(valeur) === null);
  const dansLaListe = typePieceDeLaListe(valeur);
  const choix = [...TYPES_PIECE_IDENTITE, TYPE_PIECE_AUTRE] as string[];

  function choisir(c: string) {
    if (c === TYPE_PIECE_AUTRE) {
      setAutre(true);
      if (dansLaListe) onChange("");
      return;
    }
    setAutre(false);
    // Un second toucher sur la pièce choisie la retire (le champ est optionnel).
    onChange(dansLaListe === c ? "" : c);
  }

  return (
    <View>
      <Text style={styles.label}>{libelle}</Text>
      <View style={styles.puces} accessibilityRole="radiogroup">
        {choix.map((c) => {
          const actif = c === TYPE_PIECE_AUTRE ? autre : !autre && dansLaListe === c;
          return (
            <Pressable
              key={c}
              style={[styles.puce, actif && styles.puceActive]}
              onPress={() => choisir(c)}
              accessibilityRole="radio"
              accessibilityState={{ checked: actif }}
              accessibilityLabel={c === TYPE_PIECE_AUTRE ? "Autre pièce, à préciser" : c}
            >
              <Text style={[styles.puceTexte, actif && styles.puceTexteActive]}>{c}</Text>
            </Pressable>
          );
        })}
      </View>
      {autre && (
        <TextInput
          style={styles.champ}
          value={valeur}
          onChangeText={onChange}
          accessibilityLabel="Nom de la pièce d'identité"
          placeholder="Nom de la pièce"
          placeholderTextColor={couleurs.encreFaible}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginTop: espacements.s2 },
  puces: { flexDirection: "row", flexWrap: "wrap", gap: espacements.s2, marginTop: espacements.s1 },
  puce: { minHeight: 40, paddingHorizontal: espacements.s3, justifyContent: "center", borderRadius: rayons.sm, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface200 },
  puceActive: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleu },
  puceTexte: { fontSize: 13, color: couleurs.encre },
  puceTexteActive: { color: "#fff", fontWeight: "600" },
  champ: { minHeight: 44, marginTop: espacements.s2, paddingHorizontal: espacements.s3, borderRadius: rayons.sm, borderWidth: 1, borderColor: couleurs.bordure, color: couleurs.encre, backgroundColor: couleurs.surface200 },
});
