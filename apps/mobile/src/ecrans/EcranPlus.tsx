import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Settings, UserRound } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { LIBELLE_ROLE, sectionsPlusPourRole } from "../navigation";
import { useSession } from "../contexteSession";
import { EnteteMobile } from "../composants/EnteteMobile";

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]!.toUpperCase())
    .join("");
}

/** Onglet "Plus" — profil courant, actions rattachées à l'appareil (pas
 * d'écran Paramètres mobile pour l'instant : l'URL de l'API se configure
 * encore uniquement via `stockage/configuration.ts`), et les modules du
 * rôle qui n'ont pas leur propre onglet en bas (Réception au-delà de
 * Chambres, Cafétaria, Administration — voir `sectionsPlusPourRole`). */
export function EcranPlus() {
  const { utilisateur, changerDeProfil } = useSession();
  const sections = sectionsPlusPourRole(utilisateur.role);

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <ScrollView contentContainerStyle={styles.contenu}>
        <View style={styles.carteProfil}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTexte}>{initiales(utilisateur.nom)}</Text>
          </View>
          <Text style={styles.nom}>{utilisateur.nom}</Text>
          <Text style={styles.role}>{LIBELLE_ROLE[utilisateur.role]}</Text>
        </View>

        <Pressable style={styles.ligne} onPress={changerDeProfil}>
          <UserRound size={18} color={couleurs.encre} />
          <Text style={styles.ligneTexte}>Changer de profil</Text>
        </Pressable>

        <View style={[styles.ligne, styles.ligneDesactivee]}>
          <Settings size={18} color={couleurs.encreFaible} />
          <Text style={[styles.ligneTexte, styles.ligneTexteDesactive]}>Paramètres</Text>
          <View style={styles.badgeBientot}>
            <Text style={styles.badgeBientotTexte}>Bientôt</Text>
          </View>
        </View>

        {/* Modules qui n'ont pas leur propre onglet en bas (Réception au-delà
            de Chambres, Cafétaria, Administration) — même contenu que la
            barre latérale desktop, voir navigation.ts. Sans ça, un compte
            CAFETARIA ne voit nulle part que son module existe. */}
        {sections.map((section) => (
          <View key={section.titre} style={styles.section}>
            <Text style={styles.titreSection}>{section.titre}</Text>
            {section.entrees.map((entree) => (
              <View key={entree.id} style={[styles.ligne, styles.ligneDesactivee]}>
                <Text style={[styles.ligneTexte, styles.ligneTexteDesactive]}>{entree.libelle}</Text>
                <View style={styles.badgeBientot}>
                  <Text style={styles.badgeBientotTexte}>Bientôt</Text>
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  contenu: { padding: espacements.s4, gap: espacements.s3 },
  carteProfil: {
    alignItems: "center",
    gap: espacements.s1,
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s5,
    marginBottom: espacements.s2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: rayons.pill,
    backgroundColor: couleurs.bleuClair,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: espacements.s2,
  },
  avatarTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 18 },
  nom: { fontSize: 17, fontWeight: "700", color: couleurs.encre },
  role: { fontSize: 13, color: couleurs.encreAttenuee },
  section: { gap: espacements.s2, marginTop: espacements.s2 },
  titreSection: {
    fontSize: 12,
    fontWeight: "700",
    color: couleurs.encreAttenuee,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ligne: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s3,
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
  },
  ligneDesactivee: { opacity: 0.7 },
  ligneTexte: { flex: 1, fontSize: 15, fontWeight: "600", color: couleurs.encre },
  ligneTexteDesactive: { color: couleurs.encreFaible },
  badgeBientot: { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 2 },
  badgeBientotTexte: { fontSize: 10, fontWeight: "700", color: couleurs.encreAttenuee },
});
