import * as React from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogOut } from "lucide-react-native";
import { Role } from "@hotel-chicago/types";
import { dateAbonnement } from "@hotel-chicago/regles";
import { couleurs, espacements, rayons } from "../tokens";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { PanneauAbonnement } from "../composants/PanneauAbonnement";

/**
 * Affiché À LA PLACE de l'application quand le serveur refuse l'accès pour abonnement expiré (profil frais `abonnement.bloque`, ou
 * synchronisation refusée en 402). Les données restent sur le téléphone et les actions en attente restent en file : rien n'est perdu.
 * Le patron peut payer ici ; les autres rôles voient l'état et le message « Demandez au patron de renouveler ».
 * `onContinuer` (App.tsx) relit le profil, le mémorise, force une synchronisation et réaffiche l'application sans redémarrage.
 */
export function EcranAbonnementBloque({ onContinuer }: { onContinuer: () => Promise<void> }) {
  const { client, utilisateur, seDeconnecter, changerDeProfil } = useSession();
  const insets = useSafeAreaInsets();
  const etatSync = useSyncEtat();
  const statut = utilisateur.abonnement?.statut;
  const estPatron = utilisateur.role === Role.PATRON;

  const titre =
    statut === "SUSPENDU" ? "L'accès de votre hôtel est suspendu" : statut === "RESILIE" ? "L'abonnement de votre hôtel est résilié" : "Votre abonnement a expiré";
  const enAttente = etatSync.enAttente;

  function confirmerDeconnexion() {
    Alert.alert("Se déconnecter", "Voulez-vous vraiment vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Se déconnecter", style: "destructive", onPress: seDeconnecter },
    ]);
  }

  return (
    <View style={styles.page}>
      <View style={[styles.barre, { paddingTop: insets.top + espacements.s2 }]}>
        <Image source={require("../../assets/hotelsaver-logo.png")} style={styles.logo} resizeMode="contain" />
        <Text style={styles.marque}>HotelSaver</Text>
      </View>
      <ConteneurFormulaire styleContenu={{ paddingBottom: espacements.s7 + insets.bottom, gap: espacements.s4 }}>
        <View style={styles.entete}>
          <Text style={styles.titre} accessibilityRole="header">
            {titre}
          </Text>
          {/* Hôtel jamais payé : ses données seront supprimées à cette date (protection contre les essais abusifs, 18/10/2026). */}
          <Text style={styles.texte}>
            {utilisateur.abonnement?.suppressionLe
              ? `Payez votre abonnement pour rouvrir l'application. Sans paiement, les données de votre hôtel seront supprimées le ${dateAbonnement(utilisateur.abonnement.suppressionLe)}.`
              : "Vos données sont conservées. Rien n'est perdu."}
          </Text>
          {enAttente > 0 && (
            <Text style={styles.texte}>
              {enAttente === 1
                ? "1 action faite sur ce téléphone sera envoyée dès le renouvellement."
                : `${enAttente} actions faites sur ce téléphone seront envoyées dès le renouvellement.`}
            </Text>
          )}
        </View>

        <PanneauAbonnement client={client} role={utilisateur.role} profilAbonnement={utilisateur.abonnement} mode="bloque" onContinuer={onContinuer} />

        {estPatron ? (
          <Pressable style={styles.boutonSecondaire} onPress={changerDeProfil} accessibilityRole="button" accessibilityLabel="Changer de profil">
            <Text style={styles.boutonSecondaireTexte}>Changer de profil</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.boutonDanger} onPress={confirmerDeconnexion} accessibilityRole="button" accessibilityLabel="Se déconnecter">
            <LogOut size={16} color="#fff" />
            <Text style={styles.boutonDangerTexte}>Se déconnecter</Text>
          </Pressable>
        )}
      </ConteneurFormulaire>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  barre: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s2,
    backgroundColor: couleurs.navy,
    paddingHorizontal: espacements.s4,
    paddingBottom: espacements.s3,
  },
  logo: { width: 24, height: 24 },
  marque: { fontWeight: "700", fontSize: 16, color: "#fff" },
  entete: { gap: espacements.s2 },
  titre: { fontSize: 24, fontWeight: "700", color: couleurs.navy },
  texte: { fontSize: 15, color: couleurs.encre, lineHeight: 22 },
  boutonSecondaire: {
    minHeight: 48,
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface200,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonSecondaireTexte: { color: couleurs.encre, fontWeight: "600", fontSize: 15 },
  boutonDanger: {
    flexDirection: "row",
    minHeight: 48,
    borderRadius: rayons.md,
    backgroundColor: couleurs.danger,
    alignItems: "center",
    justifyContent: "center",
    gap: espacements.s2,
  },
  boutonDangerTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
