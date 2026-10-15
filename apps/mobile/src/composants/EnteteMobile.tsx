import * as React from "react";
import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, Building2, ChevronDown, LogOut, RefreshCw } from "lucide-react-native";
import { Role } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { useSession } from "../contexteSession";
import { LIBELLE_ROLE } from "../navigation";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { useNotifications } from "../notifications/ContexteNotifications";
import { FeuilleModale } from "./FeuilleModale";
import { AvatarUtilisateur } from "./AvatarUtilisateur";

/** Vert = à jour, orange = des changements attendent d'être envoyés, rouge =
 * un conflit à vérifier, gris = hors ligne sans rien en attente. Un point
 * discret plutôt qu'un second bouton — l'écran détaillé vit dans l'onglet Plus. */
function couleurPointSync(etat: ReturnType<typeof useSyncEtat>): string {
  if (etat.conflits > 0) return couleurs.danger;
  if (etat.enAttente > 0) return couleurs.alerte;
  if (etat.enLigne) return couleurs.succes;
  return couleurs.encreFaible;
}


/**
 * Bande du haut de tous les écrans connectés (maquette du patron, 15/10/2026) :
 * fond blanc, horloge/batterie en sombre ; logo seul + « HotelSaver / Gestion
 * hôtelière » à gauche ; cloche (notifications + point de synchro) et avatar
 * à droite. L'avatar ouvre le menu du compte (nom, rôle, hôtel, changer de
 * profil — patron seulement, comme dans Plus — et déconnexion).
 */
export function EnteteMobile() {
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
            <Pressable style={styles.boutonIcone} onPress={ouvrirCentre} hitSlop={8} accessibilityLabel="Notifications">
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
              accessibilityLabel="Menu du compte"
            >
              <AvatarUtilisateur taille={38} />
              <ChevronDown size={16} color={couleurs.encreAttenuee} />
            </Pressable>
          </View>
        </View>
      </View>

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
  boutonIcone: { padding: espacements.s2 },
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
