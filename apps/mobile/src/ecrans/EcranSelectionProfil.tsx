import * as React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { UserPlus } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import type { ProfilEnregistre } from "../stockage/profils";
import { LIBELLE_ROLE } from "../navigation";

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]!.toUpperCase())
    .join("");
}

export interface EcranSelectionProfilProps {
  profils: ProfilEnregistre[];
  onChoisir: (profil: ProfilEnregistre) => void;
  onAjouterCompte: () => void;
  /** Appui long sur une carte : retire ce profil de l'appareil (ex. personnel parti). */
  onOublierProfil: (profil: ProfilEnregistre) => void;
}

/** Section 5 : "sélection de profil au démarrage" — plusieurs membres du
 * personnel partagent le même téléphone. */
export function EcranSelectionProfil({ profils, onChoisir, onAjouterCompte, onOublierProfil }: EcranSelectionProfilProps) {
  return (
    <View style={styles.page}>
      <Text style={styles.titre}>Hôtel Chicago</Text>
      <Text style={styles.sousTitre}>Qui utilise l'appareil ?</Text>
      {profils.length > 0 && <Text style={styles.astuce}>Appui long sur un profil pour le retirer de cet appareil.</Text>}

      <FlatList
        data={profils}
        keyExtractor={(p) => p.utilisateurId}
        contentContainerStyle={styles.liste}
        renderItem={({ item }) => (
          <Pressable
            style={styles.carte}
            onPress={() => onChoisir(item)}
            onLongPress={() => onOublierProfil(item)}
            delayLongPress={500}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarTexte}>{initiales(item.nom)}</Text>
            </View>
            <View style={styles.identite}>
              <Text style={styles.nom}>{item.nom}</Text>
              <Text style={styles.role}>{LIBELLE_ROLE[item.role]}</Text>
            </View>
          </Pressable>
        )}
      />

      <Pressable style={styles.boutonAjouter} onPress={onAjouterCompte}>
        <UserPlus size={18} color={couleurs.bleu} />
        <Text style={styles.boutonAjouterTexte}>Ajouter un compte</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: couleurs.surface100,
    padding: espacements.s5,
    paddingTop: espacements.s7,
  },
  titre: { fontSize: 28, fontWeight: "700", color: couleurs.navy },
  sousTitre: { fontSize: 15, color: couleurs.encreAttenuee, marginTop: espacements.s1 },
  astuce: { fontSize: 12, color: couleurs.encreFaible, marginTop: espacements.s1, marginBottom: espacements.s5 },
  liste: { gap: espacements.s3 },
  carte: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s3,
    padding: espacements.s4,
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: rayons.pill,
    backgroundColor: couleurs.bleuClair,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 15 },
  identite: { flex: 1 },
  nom: { fontSize: 16, fontWeight: "600", color: couleurs.encre },
  role: { fontSize: 13, color: couleurs.encreAttenuee, marginTop: 2 },
  boutonAjouter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espacements.s2,
    marginTop: espacements.s4,
    paddingVertical: espacements.s3,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bleu,
  },
  boutonAjouterTexte: { color: couleurs.bleu, fontWeight: "600", fontSize: 15 },
});
