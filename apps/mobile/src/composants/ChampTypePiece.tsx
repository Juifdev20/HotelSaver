import * as React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { TYPE_PIECE_AUTRE, TYPES_PIECE_IDENTITE, typePieceDeLaListe } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { FeuilleModale } from "./FeuilleModale";

export interface ChampTypePieceProps {
  /** Texte enregistré (libellé de la liste, ou texte libre pour une pièce hors liste). */
  valeur: string;
  onChange: (valeur: string) => void;
  libelle?: string;
}

/**
 * Un seul champ : on le touche, la liste des pièces d'identité (carte d'électeur, passeport, visa…) s'ouvre, on fait défiler et on choisit.
 * « Autre » laisse écrire une pièce qui n'est pas dans la liste. Une ancienne saisie libre reconnue (« CNI ») est retrouvée dans la liste.
 */
export function ChampTypePiece({ valeur, onChange, libelle = "Type de pièce (optionnel)" }: ChampTypePieceProps) {
  const [ouvert, setOuvert] = React.useState(false);
  const [autre, setAutre] = React.useState(() => valeur.trim() !== "" && typePieceDeLaListe(valeur) === null);
  const dansLaListe = typePieceDeLaListe(valeur);
  const affiche = autre ? TYPE_PIECE_AUTRE : (dansLaListe ?? "");

  function choisir(c: string | null) {
    setOuvert(false);
    if (c === TYPE_PIECE_AUTRE) {
      setAutre(true);
      if (dansLaListe) onChange("");
      return;
    }
    setAutre(false);
    onChange(c ?? "");
  }

  const options: (string | null)[] = [...(affiche ? [null] : []), ...TYPES_PIECE_IDENTITE, TYPE_PIECE_AUTRE];

  return (
    <View>
      <Text style={styles.label}>{libelle}</Text>
      <Pressable
        style={styles.champ}
        onPress={() => setOuvert(true)}
        accessibilityRole="button"
        accessibilityLabel={`${libelle}, ${affiche || "aucune pièce choisie"}. Toucher pour choisir.`}
      >
        <Text style={[styles.valeur, !affiche && styles.placeholder]} numberOfLines={1}>
          {affiche || "Choisir une pièce"}
        </Text>
        <ChevronDown size={18} color={couleurs.encreAttenuee} />
      </Pressable>
      {autre && (
        <TextInput
          style={styles.saisie}
          value={valeur}
          onChangeText={onChange}
          accessibilityLabel="Nom de la pièce d'identité"
          placeholder="Nom de la pièce"
          placeholderTextColor={couleurs.encreFaible}
        />
      )}

      <FeuilleModale visible={ouvert} onFermer={() => setOuvert(false)} titre="Type de pièce d'identité">
        {options.map((c) => {
          const actif = c !== null && (c === TYPE_PIECE_AUTRE ? autre : !autre && dansLaListe === c);
          return (
            <Pressable
              key={c ?? "aucune"}
              style={styles.option}
              onPress={() => choisir(c)}
              accessibilityRole="radio"
              accessibilityState={{ checked: actif }}
            >
              <Text style={[styles.optionTexte, actif && styles.optionTexteActive, c === null && styles.optionEffacer]}>
                {c === null ? "Aucune (effacer le choix)" : c === TYPE_PIECE_AUTRE ? "Autre (préciser)" : c}
              </Text>
              {actif && <Check size={18} color={couleurs.bleu} />}
            </Pressable>
          );
        })}
      </FeuilleModale>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginTop: espacements.s2 },
  champ: {
    minHeight: 44,
    marginTop: espacements.s1,
    paddingHorizontal: espacements.s3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: espacements.s2,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface200,
  },
  valeur: { flex: 1, fontSize: 15, color: couleurs.encre },
  placeholder: { color: couleurs.encreFaible },
  saisie: {
    minHeight: 44,
    marginTop: espacements.s2,
    paddingHorizontal: espacements.s3,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    fontSize: 15,
    color: couleurs.encre,
    backgroundColor: couleurs.surface200,
  },
  option: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: espacements.s2, borderBottomWidth: 1, borderBottomColor: couleurs.bordure },
  optionTexte: { fontSize: 15, color: couleurs.encre },
  optionTexteActive: { color: couleurs.bleu, fontWeight: "700" },
  optionEffacer: { color: couleurs.encreAttenuee, fontStyle: "italic" },
});
