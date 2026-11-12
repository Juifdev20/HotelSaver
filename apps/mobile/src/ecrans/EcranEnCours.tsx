import * as React from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CompteCafeteria } from "@hotel-chicago/types";
import { Ticket } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { useSession } from "../contexteSession";
import { useRetourAndroid } from "../hooks/useRetourAndroid";
import { EcranComptesOuverts } from "./EcranComptesOuverts";
import { EcranCuisine } from "./EcranCuisine";
import { EcranRetraitCommande } from "./EcranRetraitCommande";

export interface EcranEnCoursProps {
  onOuvrirCompte: (compteId: string, compte?: CompteCafeteria) => void;
  onRetour: () => void;
}

/**
 * « En cours » (12/11/2026) : les tables ouvertes, la cuisine (onglet « En cuisine », seulement si le suivi cuisine est activé dans Réglages) et, en haut,
 * « Retirer une commande web » (le client donne sa référence). Remplace les lignes « Cuisine » et « Retrait commande » du menu Plus.
 */
export function EcranEnCours({ onOuvrirCompte, onRetour }: EcranEnCoursProps) {
  const { client, utilisateur } = useSession();
  const [segment, setSegment] = useState<"tables" | "cuisine">("tables");
  const [retrait, setRetrait] = useState(false);
  const cuisine = utilisateur.cuisineActivee === true;

  useRetourAndroid(() => {
    if (!retrait) return false;
    setRetrait(false);
    return true;
  });

  if (retrait) {
    return (
      <EcranRetraitCommande
        client={client}
        onRetour={() => setRetrait(false)}
        onOuvrirCompte={(compteId) => {
          setRetrait(false);
          onOuvrirCompte(compteId);
        }}
      />
    );
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <View style={styles.entete}>
        <View style={{ flex: 1 }}>
          <Text style={styles.titre} accessibilityRole="header">
            En cours
          </Text>
          <Text style={styles.sousTitre}>{cuisine ? "Les tables ouvertes et la cuisine" : "Les tables ouvertes"}</Text>
        </View>
        <Pressable style={styles.retrait} onPress={() => setRetrait(true)} accessibilityRole="button" accessibilityLabel="Retirer une commande web : saisir la référence du client">
          <Ticket size={17} color={couleurs.bleu} />
          <Text style={styles.retraitTexte}>Retirer une commande web</Text>
        </Pressable>
      </View>

      {cuisine && (
        <View style={styles.segments} accessibilityRole="tablist">
          {([["tables", "Tables"], ["cuisine", "En cuisine"]] as const).map(([id, nom]) => (
            <Pressable key={id} style={[styles.segment, segment === id && styles.segmentActif]} onPress={() => setSegment(id)} accessibilityRole="tab" accessibilityLabel={nom} accessibilityState={{ selected: segment === id }}>
              <Text style={[styles.segmentTexte, segment === id && styles.segmentTexteActif]}>{nom}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {segment === "cuisine" && cuisine ? (
        <EcranCuisine client={client} integre onRetour={() => setSegment("tables")} onOuvrirCompte={(compteId) => onOuvrirCompte(compteId)} />
      ) : (
        <EcranComptesOuverts integre onRetour={onRetour} onOuvrirCompte={onOuvrirCompte} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  entete: { flexDirection: "row", alignItems: "center", gap: espacements.s3, paddingHorizontal: espacements.s4, paddingTop: espacements.s3, paddingBottom: espacements.s2 },
  titre: { fontSize: 22, fontWeight: "700", color: couleurs.navy },
  sousTitre: { fontSize: 13, color: couleurs.encreAttenuee, marginTop: 2 },
  retrait: { maxWidth: 150, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: espacements.s3, borderRadius: rayons.md + 2, borderWidth: 1.5, borderColor: couleurs.bleu },
  retraitTexte: { flex: 1, fontSize: 12, fontWeight: "700", color: couleurs.bleu, lineHeight: 14 },
  segments: { flexDirection: "row", marginHorizontal: espacements.s4, marginBottom: espacements.s1, padding: 4, gap: 4, borderRadius: rayons.md + 4, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface200 },
  segment: { flex: 1, minHeight: 42, borderRadius: rayons.sm + 2, alignItems: "center", justifyContent: "center" },
  segmentActif: { backgroundColor: couleurs.navy },
  segmentTexte: { fontSize: 14, fontWeight: "600", color: couleurs.encreAttenuee },
  segmentTexteActif: { color: "#fff", fontWeight: "800" },
});
