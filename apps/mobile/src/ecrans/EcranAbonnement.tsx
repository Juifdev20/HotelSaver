import * as React from "react";
import { StyleSheet, View } from "react-native";
import { couleurs } from "../tokens";
import { useSession } from "../contexteSession";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { PanneauAbonnement } from "../composants/PanneauAbonnement";

export interface EcranAbonnementProps {
  onRetour: () => void;
}

/**
 * « Abonnement » (Plus ou Paramètres) : l'état de l'abonnement pour tous les rôles ; pour le PATRON, le choix de la formule et le paiement
 * Mobile Money directement dans l'application. Tout le contenu est dans PanneauAbonnement (partagé avec l'écran « abonnement expiré »).
 */
export function EcranAbonnement({ onRetour }: EcranAbonnementProps) {
  const { client, utilisateur, apresRenouvellement } = useSession();
  return (
    <View style={styles.page}>
      <EnteteMobile sansBandeauAbonnement />
      <EnteteRetour titre="Abonnement" onRetour={onRetour} />
      <ConteneurFormulaire>
        <PanneauAbonnement
          client={client}
          role={utilisateur.role}
          profilAbonnement={utilisateur.abonnement}
          mode="ecran"
          onPaiementConfirme={apresRenouvellement}
          onContinuer={onRetour}
        />
      </ConteneurFormulaire>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
});
