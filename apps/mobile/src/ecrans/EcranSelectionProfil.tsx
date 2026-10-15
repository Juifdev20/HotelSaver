import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BriefcaseBusiness, ChevronRight, UserPlus } from "lucide-react-native";
import { couleurs } from "../tokens";
import type { ProfilEnregistre } from "../stockage/profils";
import { LIBELLE_ROLE } from "../navigation";
import { AvatarUtilisateur } from "../composants/AvatarUtilisateur";
import { PageAuth } from "../composants/PageAuth";

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
      {profils.length > 0 && <Text style={styles.astuce}>Appuyez longuement sur un profil pour le retirer de cet appareil.</Text>}

      {profils.length > 0 && <Text style={styles.section}>COMPTES ENREGISTRÉS</Text>}
      <View style={styles.liste}>
        {profils.map((profil) => (
          <Pressable
            key={profil.utilisateurId}
            style={({ pressed }) => [styles.carte, pressed && styles.cartePressee]}
            onPress={() => onChoisir(profil)}
            onLongPress={() => onOublierProfil(profil)}
            delayLongPress={500}
            accessibilityRole="button"
            accessibilityLabel={`${profil.nom}, ${LIBELLE_ROLE[profil.role]}`}
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
            <ChevronRight size={20} color="#5B6B8C" />
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.boutonAjouter} onPress={onAjouterCompte}>
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
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DCE4F0",
  },
  cartePressee: { backgroundColor: "#F3F7FE" },
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
    height: 50,
    borderRadius: 12,
    backgroundColor: couleurs.bleu,
  },
  boutonAjouterTexte: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
