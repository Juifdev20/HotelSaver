import * as React from "react";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, Building2 } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { useSession } from "../contexteSession";
import { LIBELLE_ROLE } from "../navigation";

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]!.toUpperCase())
    .join("");
}

/** Barre du haut + ligne d'accueil — même répartition que la barre du haut
 * du desktop en fenêtre étroite : logo/nom à gauche, cloche à droite, puis
 * « Bonjour, {nom} » en dessous puisqu'il n'y a pas de place pour
 * l'avatar/nom dans la barre. Pas de menu hamburger ici : « Changer de
 * profil » et les infos du compte vivent déjà dans l'onglet "Plus" — un
 * deuxième accès au même endroit n'apportait rien (retour du 25/09/2026). */
export function EnteteMobile({ afficherAccueil = false }: { afficherAccueil?: boolean }) {
  const { utilisateur } = useSession();
  const [notifOuvertes, setNotifOuvertes] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <>
      {/* La couleur remonte jusqu'en haut de l'écran (paddingTop = zone de la
       * barre de statut) au lieu de s'arrêter dessous : sur Android récent
       * (edge-to-edge), le contenu dessine déjà sous l'horloge/batterie, donc
       * sans ça leur fond dépend du téléphone et la barre paraît collée tout
       * en haut. Un peu d'air en plus (espacements.s2) évite l'effet
       * « écrasé » contre les icônes système. */}
      <View style={[styles.barreConteneur, { paddingTop: insets.top + espacements.s2 }]}>
        <View style={styles.barre}>
          <View style={styles.marque}>
            <Building2 size={16} color={couleurs.navy} />
            <Text style={styles.marqueTexte}>Hôtel Chicago</Text>
          </View>
          <Pressable style={styles.boutonIcone} onPress={() => setNotifOuvertes(true)} hitSlop={8}>
            <Bell size={20} color={couleurs.encre} />
          </Pressable>
        </View>
      </View>

      {afficherAccueil && (
        <View style={styles.ligneAccueil}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTexte}>{initiales(utilisateur.nom)}</Text>
          </View>
          <View>
            <Text style={styles.bonjour}>Bonjour, {utilisateur.nom}</Text>
            <Text style={styles.role}>{LIBELLE_ROLE[utilisateur.role]}</Text>
          </View>
        </View>
      )}

      <Modal visible={notifOuvertes} transparent animationType="fade" onRequestClose={() => setNotifOuvertes(false)}>
        <Pressable style={styles.fond} onPress={() => setNotifOuvertes(false)}>
          <View style={styles.feuille}>
            <View style={styles.feuillePoignee} />
            <Text style={styles.bonjour}>Notifications</Text>
            <Text style={styles.role}>Aucune notification pour le moment.</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  barreConteneur: {
    backgroundColor: couleurs.surface200,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  barre: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: espacements.s3,
  },
  boutonIcone: { padding: espacements.s2 },
  marque: { flexDirection: "row", alignItems: "center", gap: espacements.s1 },
  marqueTexte: { fontWeight: "700", fontSize: 15, color: couleurs.encre },
  ligneAccueil: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s3,
    paddingHorizontal: espacements.s4,
    paddingVertical: espacements.s3,
    backgroundColor: couleurs.surface200,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: rayons.pill,
    backgroundColor: couleurs.bleuClair,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 13 },
  bonjour: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  role: { fontSize: 12, color: couleurs.encreAttenuee, marginTop: 2 },
  fond: { flex: 1, backgroundColor: "rgba(15,39,66,0.4)", justifyContent: "flex-end" },
  feuille: {
    backgroundColor: couleurs.surface200,
    borderTopLeftRadius: rayons.lg,
    borderTopRightRadius: rayons.lg,
    padding: espacements.s5,
    gap: espacements.s3,
  },
  feuillePoignee: {
    width: 40,
    height: 4,
    borderRadius: rayons.pill,
    backgroundColor: couleurs.bordure,
    alignSelf: "center",
    marginBottom: espacements.s2,
  },
});
