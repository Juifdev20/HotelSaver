import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BriefcaseBusiness, Trash2, UserPlus } from "lucide-react-native";
import { couleurs } from "../tokens";
import type { ProfilEnregistre } from "../stockage/profils";
import { LIBELLE_ROLE } from "../navigation";
import { AvatarUtilisateur } from "../composants/AvatarUtilisateur";
import { PageAuth } from "../composants/PageAuth";
import { confirmerAction } from "../confirmer";

/** Retirer un profil efface ses accès rapides de cet appareil : on le nomme avant (retour U3, U8). */
function demanderRetrait(profil: ProfilEnregistre, onOublierProfil: (profil: ProfilEnregistre) => void) {
  confirmerAction({
    titre: `Retirer le profil de ${profil.nom} ?`,
    message: `${LIBELLE_ROLE[profil.role]}.\nCette personne devra se reconnecter avec son numéro de téléphone et son mot de passe pour réutiliser ce téléphone. Son compte n'est pas supprimé.`,
    libelleConfirmer: "Retirer le profil",
    libelleRefuser: "Garder",
    destructif: true,
    onConfirmer: () => onOublierProfil(profil),
  });
}

export interface EcranSelectionProfilProps {
  profils: ProfilEnregistre[];
  onChoisir: (profil: ProfilEnregistre) => void;
  onAjouterCompte: () => void;
  /** Appui long sur une carte : retire ce profil de l'appareil (ex. personnel parti). */
  onOublierProfil: (profil: ProfilEnregistre) => void;
}

/** Section 5 : "sélection de profil au démarrage" — plusieurs membres du
 * personnel partagent le même téléphone. Maquette du 15/10/2026 : même gabarit
 * que Connexion / Inscription (PageAuth — coins et vagues bleu pâle, en-tête
 * centré au même endroit), cartes avec rôle et chevron, « Ajouter un compte »
 * en bouton plein. Liste en simple map : quelques profils au plus par appareil. */
export function EcranSelectionProfil({ profils, onChoisir, onAjouterCompte, onOublierProfil }: EcranSelectionProfilProps) {
  return (
    <PageAuth>
      <Text style={styles.titre}>Qui utilise HotelSaver sur cet appareil ?</Text>
      <Text style={styles.sousTitre}>Choisissez un profil pour continuer.</Text>
      {profils.length > 0 && <Text style={styles.astuce}>Touchez la corbeille (ou appuyez longuement sur un profil) pour le retirer de cet appareil.</Text>}

      {profils.length > 0 && <Text style={styles.section}>COMPTES ENREGISTRÉS</Text>}
      <View style={styles.liste}>
        {profils.map((profil) => (
          <View key={profil.utilisateurId} style={styles.carte}>
            <Pressable
              style={({ pressed }) => [styles.zoneProfil, pressed && styles.cartePressee]}
              onPress={() => onChoisir(profil)}
              onLongPress={() => demanderRetrait(profil, onOublierProfil)}
              delayLongPress={500}
              accessibilityRole="button"
              accessibilityLabel={`${profil.nom}, ${LIBELLE_ROLE[profil.role]}`}
              accessibilityHint="Ouvre ce profil. Appui long pour le retirer de l'appareil."
            >
              <AvatarUtilisateur taille={48} />
              <View style={styles.identite}>
                <Text style={styles.nom} numberOfLines={1}>
                  {profil.nom}
                </Text>
                <View style={styles.ligneRole}>
                  <BriefcaseBusiness size={15} color="#5B6B8C" />
                  <Text style={styles.role}>{LIBELLE_ROLE[profil.role]}</Text>
                </View>
              </View>
            </Pressable>
            <Pressable
              style={styles.boutonRetirer}
              onPress={() => demanderRetrait(profil, onOublierProfil)}
              accessibilityRole="button"
              accessibilityLabel={`Retirer le profil de ${profil.nom} de cet appareil`}
            >
              <Trash2 size={18} color={couleurs.danger} />
            </Pressable>
          </View>
        ))}
      </View>

      <Pressable style={styles.boutonAjouter} onPress={onAjouterCompte} accessibilityRole="button" accessibilityLabel="Ajouter un compte">
        <UserPlus size={20} color="#fff" />
        <Text style={styles.boutonAjouterTexte}>Ajouter un compte</Text>
      </Pressable>
    </PageAuth>
  );
}

const styles = StyleSheet.create({
  titre: { fontSize: 24, fontWeight: "800", color: couleurs.navy, letterSpacing: -0.3, textAlign: "center" },
  sousTitre: { fontSize: 15, color: "#5B6B8C", marginTop: 6, textAlign: "center" },
  astuce: { fontSize: 12.5, color: "#7A879C", marginTop: 10, textAlign: "center" },
  section: { fontSize: 12.5, fontWeight: "700", color: "#7A879C", letterSpacing: 0.8, marginTop: 22, marginBottom: 10 },
  liste: { gap: 12 },
  carte: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingLeft: 14,
    paddingRight: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DCE4F0",
  },
  zoneProfil: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14, minHeight: 44, paddingVertical: 14 },
  boutonRetirer: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  cartePressee: { opacity: 0.7 },
  identite: { flex: 1, gap: 4 },
  nom: { fontSize: 16, fontWeight: "700", color: couleurs.navy },
  ligneRole: { flexDirection: "row", alignItems: "center", gap: 6 },
  role: { fontSize: 14, color: "#5B6B8C" },
  boutonAjouter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 28,
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: couleurs.bleu,
  },
  boutonAjouterTexte: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
