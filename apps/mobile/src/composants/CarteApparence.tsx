import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Moon, Smartphone, Sun } from "lucide-react-native";
import type { PreferenceApparence } from "@hotel-chicago/regles";
import { couleurs, espacements, rayons } from "../tokens";
import { useApparence } from "../theme/ContexteApparence";

const CHOIX: { id: PreferenceApparence; libelle: string; aide: string; Icone: typeof Sun }[] = [
  { id: "auto", libelle: "Auto", aide: "Suit le téléphone", Icone: Smartphone },
  { id: "clair", libelle: "Clair", aide: "Fond blanc", Icone: Sun },
  { id: "sombre", libelle: "Sombre", aide: "Fond bleu nuit", Icone: Moon },
];

/**
 * Plus › Paramètres › Apparence (décision du 11/11/2026) : Auto (par défaut), Clair, Sombre. Propre à cet appareil, retenu au prochain lancement.
 * Le changement est immédiat, sans redémarrer ; on reste dans Paramètres.
 */
export function CarteApparence() {
  const { preference, schema, definir } = useApparence();
  const IconeTitre = schema === "sombre" ? Moon : Sun;
  return (
    <View style={styles.carte}>
      <View style={styles.entete}>
        <View style={styles.pastille}>
          <IconeTitre size={18} color={couleurs.bleu} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titre} accessibilityRole="header">
            Apparence
          </Text>
          <Text style={styles.aide}>Seulement pour ce téléphone</Text>
        </View>
      </View>
      <View style={styles.choix} accessibilityRole="radiogroup">
        {CHOIX.map(({ id, libelle, aide, Icone }) => {
          const actif = preference === id;
          return (
            <Pressable
              key={id}
              style={[styles.option, actif && styles.optionActive]}
              onPress={() => {
                if (!actif) definir(id);
              }}
              accessibilityRole="radio"
              accessibilityLabel={`${libelle} : ${aide}`}
              accessibilityState={{ checked: actif }}
            >
              <Icone size={24} color={actif ? couleurs.bleu : couleurs.encre} />
              <Text style={[styles.optionTitre, actif && { color: couleurs.bleu }]}>{libelle}</Text>
              <Text style={styles.optionAide}>{aide}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: espacements.s3,
  },
  entete: { flexDirection: "row", alignItems: "center", gap: espacements.s3 },
  pastille: { width: 36, height: 36, borderRadius: 18, backgroundColor: couleurs.bleuClair, alignItems: "center", justifyContent: "center" },
  titre: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  aide: { fontSize: 12, color: couleurs.encreAttenuee },
  choix: { flexDirection: "row", gap: espacements.s2 },
  option: {
    flex: 1,
    minHeight: 96,
    borderRadius: rayons.md,
    borderWidth: 2,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface100,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: espacements.s2,
  },
  optionActive: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  optionTitre: { fontSize: 14, fontWeight: "700", color: couleurs.encre },
  optionAide: { fontSize: 11, color: couleurs.encreAttenuee, textAlign: "center" },
});
