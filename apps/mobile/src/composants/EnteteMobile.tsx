import * as React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, ChevronRight, CloudOff, RefreshCw, TriangleAlert } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { useSession } from "../contexteSession";
import { LIBELLE_ROLE } from "../navigation";
import { resumerEtatSync, type NiveauSync } from "@hotel-chicago/sync-engine";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { useNotifications } from "../notifications/ContexteNotifications";

/** Vert = vraiment à jour, orange = des changements attendent d'être envoyés ou la synchro est en difficulté, rouge =
 * un conflit ou une action refusée à vérifier, gris = hors ligne. Même vérité que l'écran « Synchronisation » (le texte
 * vient de resumerEtatSync, partagé avec le bureau). */
const COULEUR_NIVEAU: Record<NiveauSync, string> = {
  ok: couleurs.succesVif,
  attente: couleurs.alerteVive,
  attention: couleurs.alerteVive,
  horsLigne: couleurs.encreFaible,
  danger: couleurs.dangerVif,
};
function couleurPointSync(etat: ReturnType<typeof useSyncEtat>): string {
  return COULEUR_NIVEAU[resumerEtatSync(etat).niveau];
}

/** Bandeau texte fixe sous la barre : le point de 8 px ne suffisait pas (retour U4). Le TEXTE (« Hors ligne · 3 actions à envoyer »)
 * et l'icône portent l'information, la couleur n'est qu'un renfort. Rouge et cliquable vers « Synchronisation » quand une action
 * est refusée ou en conflit. Rien n'est affiché quand tout est à jour (ou pendant la toute première synchro). */
const STYLE_BANDEAU: Record<NiveauSync, { fond: string; texte: string }> = {
  ok: { fond: couleurs.succesClair, texte: couleurs.succes },
  attente: { fond: couleurs.alerteClair, texte: couleurs.alerte },
  attention: { fond: couleurs.alerteClair, texte: couleurs.alerte },
  horsLigne: { fond: couleurs.encre, texte: "#fff" },
  danger: { fond: couleurs.danger, texte: "#fff" },
};

function BandeauSync() {
  const etat = useSyncEtat();
  const { ouvrirSynchronisation } = useNotifications();
  const resume = resumerEtatSync(etat);
  if (resume.niveau === "ok" || (resume.niveau === "attente" && etat.enAttente === 0)) return null;
  const { fond, texte } = STYLE_BANDEAU[resume.niveau];
  const Icone = resume.niveau === "danger" || resume.niveau === "attention" ? TriangleAlert : resume.niveau === "horsLigne" ? CloudOff : RefreshCw;
  const aVoir = resume.niveau === "danger";
  return (
    <Pressable
      style={[styles.bandeau, { backgroundColor: fond }]}
      onPress={ouvrirSynchronisation}
      accessibilityRole={aVoir ? "alert" : "button"}
      accessibilityLabel={`État de la synchronisation : ${resume.titre}. ${resume.detail} Ouvrir l'écran Synchronisation.`}
    >
      <Icone size={16} color={texte} />
      <Text style={[styles.bandeauTexte, { color: texte }]} numberOfLines={2}>
        {resume.titre}
      </Text>
      <ChevronRight size={16} color={texte} />
    </Pressable>
  );
}

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
  const { nonLues, ouvrirCentre } = useNotifications();
  const insets = useSafeAreaInsets();
  const etatSync = useSyncEtat();

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
            <Image source={require("../../assets/hotelsaver-logo.png")} style={styles.logo} resizeMode="contain" />
            <Text style={styles.marqueTexte}>HotelSaver</Text>
          </View>
          <Pressable
            style={styles.boutonIcone}
            onPress={ouvrirCentre}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={nonLues > 0 ? `Notifications, ${nonLues} non lue${nonLues > 1 ? "s" : ""}` : "Notifications"}
          >
            <Bell size={20} color="#fff" />
            <View style={[styles.pointSync, { backgroundColor: couleurPointSync(etatSync) }]} />
            {nonLues > 0 && (
              <View style={styles.pastille}>
                <Text style={styles.pastilleTexte}>{nonLues > 9 ? "9+" : nonLues}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
      <BandeauSync />

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
    </>
  );
}

const styles = StyleSheet.create({
  // Navy comme la maquette : la barre d'état (horloge, réseau, batterie)
  // prend la même couleur, icônes claires (StatusBar style="light" dans App.tsx).
  barreConteneur: {
    backgroundColor: couleurs.navy,
  },
  barre: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: espacements.s3,
  },
  boutonIcone: { padding: espacements.s2, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  bandeau: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s2,
    minHeight: 44,
    paddingHorizontal: espacements.s4,
    paddingVertical: espacements.s2,
  },
  bandeauTexte: { flex: 1, fontSize: 13, fontWeight: "700" },
  pointSync: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: rayons.pill,
    borderWidth: 1,
    borderColor: couleurs.navy,
  },
  pastille: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: rayons.pill,
    backgroundColor: couleurs.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  pastilleTexte: { color: "#fff", fontSize: 10, fontWeight: "700" },
  marque: { flexDirection: "row", alignItems: "center", gap: espacements.s1 },
  logo: { width: 22, height: 22 },
  marqueTexte: { fontWeight: "700", fontSize: 15, color: "#fff" },
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
