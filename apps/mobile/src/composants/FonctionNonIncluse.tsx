import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Lock } from "lucide-react-native";
import { Role } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { useSession } from "../contexteSession";
import { useNotifications } from "../notifications/ContexteNotifications";
import { DESCRIPTION_FONCTION, type CodeFonction } from "../fonctions";
import { EnteteMobile } from "./EnteteMobile";
import { EnteteRetour } from "./EnteteRetour";
import { ConteneurFormulaire } from "./ConteneurFormulaire";
import { BlocAideAuto } from "./AideSupport";

export interface FonctionNonIncluseProps {
  /** La fonction qui manque, si on la connaît (précise la phrase). */
  fonction?: CodeFonction | null;
  /** Titre de l'écran demandé (« Menu », « Chambres »…) pour l'en-tête. */
  titre?: string;
  /** Bouton « Retour » en en-tête (écran atteint depuis « Plus »). */
  onRetour?: () => void;
  /** Sans en-tête ni page : juste le bloc, à poser dans un écran existant. */
  integre?: boolean;
}

/**
 * Remplace un écran dont la fonction n'est pas ouverte par la formule d'abonnement de l'hôtel (accès par notification, lien, ou profil pas encore
 * mis à jour). Le patron est envoyé vers les formules ; les autres rôles savent qui prévenir et peuvent écrire au support.
 */
export function FonctionNonIncluse({ fonction, titre, onRetour, integre = false }: FonctionNonIncluseProps) {
  const { utilisateur } = useSession();
  const { ouvrirAbonnement } = useNotifications();
  const estPatron = utilisateur.role === Role.PATRON;

  const contenu = (
    <View style={styles.colonne}>
      <View style={styles.carte}>
        <View style={styles.icone}>
          <Lock size={26} color={couleurs.alerte} />
        </View>
        <Text style={styles.titre} accessibilityRole="header">
          Cette fonction n'est pas incluse dans votre formule
        </Text>
        {fonction && <Text style={styles.texte}>{DESCRIPTION_FONCTION[fonction]} n'est pas ouverte avec la formule actuelle de votre hôtel.</Text>}
        {estPatron ? (
          <>
            <Text style={styles.texte}>Choisissez une formule qui l'inclut pour l'ouvrir tout de suite.</Text>
            <Pressable style={styles.bouton} onPress={ouvrirAbonnement} accessibilityRole="button" accessibilityLabel="Voir les formules">
              <Text style={styles.boutonTexte}>Voir les formules</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.texte}>Demandez au patron de passer à une formule supérieure.</Text>
        )}
      </View>
      <BlocAideAuto />
    </View>
  );

  if (integre) return contenu;
  return (
    <View style={styles.page}>
      <EnteteMobile />
      {onRetour && <EnteteRetour titre={titre ?? "Fonction non incluse"} onRetour={onRetour} />}
      <ConteneurFormulaire>{contenu}</ConteneurFormulaire>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  colonne: { gap: espacements.s3 },
  carte: {
    backgroundColor: couleurs.alerteClair,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.alerte,
    padding: espacements.s4,
    gap: espacements.s3,
    alignItems: "center",
  },
  icone: { width: 48, height: 48, borderRadius: rayons.pill, backgroundColor: couleurs.surface200, alignItems: "center", justifyContent: "center" },
  titre: { fontSize: 18, fontWeight: "700", color: couleurs.navy, textAlign: "center" },
  texte: { fontSize: 14, color: couleurs.encre, lineHeight: 20, textAlign: "center" },
  bouton: {
    alignSelf: "stretch",
    minHeight: 52,
    borderRadius: rayons.md,
    backgroundColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: espacements.s4,
  },
  boutonTexte: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
