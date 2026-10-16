import * as React from "react";
import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, Building2, ChevronDown, ChevronRight, CloudOff, CreditCard, LogOut, RefreshCw, TriangleAlert } from "lucide-react-native";
import { Role } from "@hotel-chicago/types";
import { resumerEtatSync, type NiveauSync } from "@hotel-chicago/sync-engine";
import { bandeauAbonnement } from "@hotel-chicago/regles";
import { couleurs, espacements, rayons } from "../tokens";
import { useSession } from "../contexteSession";
import { LIBELLE_ROLE } from "../navigation";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { useNotifications } from "../notifications/ContexteNotifications";
import { FeuilleModale } from "./FeuilleModale";
import { AvatarUtilisateur } from "./AvatarUtilisateur";

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

/** Bandeau d'abonnement (essai ou abonnement qui se termine bientôt, délai de grâce, expiré sur un profil ancien) : orange = à prévoir,
 * rouge = urgent. Texte et icône portent l'information, la couleur n'est qu'un renfort. Cliquable vers l'écran « Abonnement ». Le texte
 * vient de `bandeauAbonnement` (regles), le même que sur le bureau ; l'état vient du dernier profil reçu du serveur. */
function BandeauAbonnement() {
  const { utilisateur } = useSession();
  const { ouvrirAbonnement } = useNotifications();
  const bandeau = bandeauAbonnement(utilisateur.abonnement);
  if (!bandeau) return null;
  const danger = bandeau.niveau === "danger";
  const Icone = danger ? TriangleAlert : CreditCard;
  return (
    <Pressable
      style={[styles.bandeau, { backgroundColor: danger ? couleurs.danger : couleurs.alerte }]}
      onPress={ouvrirAbonnement}
      accessibilityRole="button"
      accessibilityLabel={`${bandeau.texte} Ouvrir l'écran Abonnement.`}
    >
      <Icone size={16} color="#fff" />
      <Text style={[styles.bandeauTexte, { color: "#fff" }]} numberOfLines={2}>
        {bandeau.texte}
      </Text>
      <ChevronRight size={16} color="#fff" />
    </Pressable>
  );
}

/**
 * Bande du haut de tous les écrans connectés (maquette du patron, 15/10/2026) :
 * fond blanc, horloge/batterie en sombre ; logo seul + « HotelSaver / Gestion
 * hôtelière » à gauche ; cloche (notifications + point de synchro) et avatar
 * à droite. L'avatar ouvre le menu du compte (nom, rôle, hôtel, changer de
 * profil — patron seulement, comme dans Plus — et déconnexion).
 */
export function EnteteMobile({ sansBandeauAbonnement = false }: { afficherAccueil?: boolean; sansBandeauAbonnement?: boolean } = {}) {
  const { utilisateur, changerDeProfil, seDeconnecter } = useSession();
  const { nonLues, ouvrirCentre } = useNotifications();
  const insets = useSafeAreaInsets();
  const etatSync = useSyncEtat();
  const [menuOuvert, setMenuOuvert] = useState(false);

  function confirmerDeconnexion() {
    setMenuOuvert(false);
    Alert.alert("Se déconnecter", "Voulez-vous vraiment vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Se déconnecter", style: "destructive", onPress: seDeconnecter },
    ]);
  }

  return (
    <>
      <StatusBar style="dark" />
      {/* Le blanc remonte jusqu'en haut de l'écran (paddingTop = zone de la
       * barre d'état) : sur Android récent (edge-to-edge), le contenu dessine
       * déjà sous l'horloge/batterie. */}
      <View style={[styles.barreConteneur, { paddingTop: insets.top + espacements.s1 }]}>
        <View style={styles.barre}>
          <View style={styles.marque}>
            {/* Le logo est déjà un carré bleu arrondi : affiché seul (recadré
             * sans sa marge transparente), jamais dans une seconde tuile. */}
            <Image source={require("../../assets/hotelsaver-logo-carre.png")} style={styles.logo} resizeMode="contain" />
            <View>
              <Text style={styles.marqueTexte}>HotelSaver</Text>
              <Text style={styles.marqueSousTexte}>Gestion hôtelière</Text>
            </View>
          </View>

          <View style={styles.droite}>
            <Pressable
              style={styles.boutonIcone}
              onPress={ouvrirCentre}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={nonLues > 0 ? `Notifications, ${nonLues} non lue${nonLues > 1 ? "s" : ""}` : "Notifications"}
            >
              <Bell size={22} color={couleurs.navy} />
              <View style={[styles.pointSync, { backgroundColor: couleurPointSync(etatSync) }]} />
              {nonLues > 0 && (
                <View style={styles.pastille}>
                  <Text style={styles.pastilleTexte}>{nonLues > 9 ? "9+" : nonLues}</Text>
                </View>
              )}
            </Pressable>
            <View style={styles.separateur} />
            <Pressable
              style={styles.boutonCompte}
              onPress={() => setMenuOuvert(true)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Menu du compte"
            >
              <AvatarUtilisateur taille={38} />
              <ChevronDown size={16} color={couleurs.encreAttenuee} />
            </Pressable>
          </View>
        </View>
      </View>

      {!sansBandeauAbonnement && <BandeauAbonnement />}
      <BandeauSync />

      <FeuilleModale visible={menuOuvert} onFermer={() => setMenuOuvert(false)} titre="Mon compte">
        <View style={styles.compte}>
          <AvatarUtilisateur taille={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.compteNom}>{utilisateur.nom}</Text>
            <Text style={styles.compteRole}>{LIBELLE_ROLE[utilisateur.role]}</Text>
          </View>
        </View>
        <View style={styles.compteHotel}>
          <Building2 size={16} color={couleurs.encreAttenuee} />
          <Text style={styles.compteHotelTexte}>{utilisateur.hotelNom}</Text>
        </View>
        {utilisateur.role === Role.PATRON && (
          <Pressable
            style={styles.action}
            onPress={() => {
              setMenuOuvert(false);
              changerDeProfil();
            }}
          >
            <RefreshCw size={18} color={couleurs.bleu} />
            <Text style={styles.actionTexte}>Changer de profil</Text>
          </Pressable>
        )}
        <Pressable style={styles.action} onPress={confirmerDeconnexion}>
          <LogOut size={18} color={couleurs.danger} />
          <Text style={[styles.actionTexte, { color: couleurs.danger }]}>Se déconnecter</Text>
        </Pressable>
      </FeuilleModale>
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
    height: 60,
    paddingHorizontal: espacements.s4,
  },
  marque: { flexDirection: "row", alignItems: "center", gap: espacements.s3, flexShrink: 1 },
  logo: { width: 44, height: 44 },
  marqueTexte: { fontWeight: "800", fontSize: 18, color: couleurs.navy },
  marqueSousTexte: { fontSize: 12, color: couleurs.encreAttenuee },
  droite: { flexDirection: "row", alignItems: "center", gap: espacements.s2 },
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
    bottom: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: rayons.pill,
    borderWidth: 1,
    borderColor: couleurs.surface200,
  },
  pastille: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: rayons.pill,
    backgroundColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
  },
  pastilleTexte: { color: "#fff", fontSize: 10, fontWeight: "700" },
  separateur: { width: 1, height: 28, backgroundColor: couleurs.bordure },
  boutonCompte: { flexDirection: "row", alignItems: "center", gap: 2 },
  compte: { flexDirection: "row", alignItems: "center", gap: espacements.s3 },
  compteNom: { fontSize: 17, fontWeight: "700", color: couleurs.encre },
  compteRole: { fontSize: 13, color: couleurs.encreAttenuee, marginTop: 2 },
  compteHotel: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s2,
    padding: espacements.s3,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.surface100,
  },
  compteHotelTexte: { fontSize: 14, color: couleurs.encre, fontWeight: "600" },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s3,
    minHeight: 48,
    paddingHorizontal: espacements.s2,
  },
  actionTexte: { fontSize: 15, fontWeight: "600", color: couleurs.encre },
});
