import * as React from "react";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Bell, Building2, Menu, UserRound } from "lucide-react-native";
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

/** Barre du haut + ligne d'accueil — même répartition que la maquette
 * mobile (image du 25/09/2026) et que la barre du haut du desktop en
 * fenêtre étroite : hamburger/logo/cloche, puis « Bonjour, {nom} » en
 * dessous puisqu'il n'y a pas de place pour l'avatar/nom dans la barre. */
export function EnteteMobile({ afficherAccueil = false }: { afficherAccueil?: boolean }) {
  const { utilisateur, changerDeProfil } = useSession();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [notifOuvertes, setNotifOuvertes] = useState(false);

  return (
    <>
      <View style={styles.barre}>
        <Pressable style={styles.boutonIcone} onPress={() => setMenuOuvert(true)} hitSlop={8}>
          <Menu size={22} color={couleurs.encre} />
        </Pressable>
        <View style={styles.marque}>
          <Building2 size={16} color={couleurs.navy} />
          <Text style={styles.marqueTexte}>Hôtel Chicago</Text>
        </View>
        <Pressable style={styles.boutonIcone} onPress={() => setNotifOuvertes(true)} hitSlop={8}>
          <Bell size={20} color={couleurs.encre} />
        </Pressable>
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

      <Modal visible={menuOuvert} transparent animationType="fade" onRequestClose={() => setMenuOuvert(false)}>
        <Pressable style={styles.fond} onPress={() => setMenuOuvert(false)}>
          <View style={styles.feuille}>
            <View style={styles.feuillePoignee} />
            <View style={styles.feuilleEntete}>
              <View style={styles.avatar}>
                <Text style={styles.avatarTexte}>{initiales(utilisateur.nom)}</Text>
              </View>
              <View>
                <Text style={styles.bonjour}>{utilisateur.nom}</Text>
                <Text style={styles.role}>{LIBELLE_ROLE[utilisateur.role]}</Text>
              </View>
            </View>
            <Pressable
              style={styles.itemMenu}
              onPress={() => {
                setMenuOuvert(false);
                changerDeProfil();
              }}
            >
              <UserRound size={18} color={couleurs.encre} />
              <Text style={styles.itemMenuTexte}>Changer de profil</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

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
  barre: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: espacements.s3,
    backgroundColor: couleurs.surface200,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
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
  feuilleEntete: { flexDirection: "row", alignItems: "center", gap: espacements.s3, marginBottom: espacements.s2 },
  itemMenu: { flexDirection: "row", alignItems: "center", gap: espacements.s3, paddingVertical: espacements.s3 },
  itemMenuTexte: { fontSize: 15, color: couleurs.encre, fontWeight: "600" },
});
