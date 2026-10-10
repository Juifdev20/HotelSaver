import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { couleurs, espacements, rayons } from "../tokens";

interface Props {
  children: React.ReactNode;
}

interface Etat {
  erreur: Error | null;
}

/**
 * Dernier filet : une erreur de rendu ne ferme plus l'application au milieu d'une vente. Les données saisies sont déjà gardées sur
 * l'appareil (base locale + file d'envoi) ; « Réessayer » réaffiche l'écran. Le message technique n'est pas montré à l'utilisateur.
 */
export class FrontiereErreur extends React.Component<Props, Etat> {
  state: Etat = { erreur: null };

  static getDerivedStateFromError(erreur: Error): Etat {
    return { erreur };
  }

  componentDidCatch(erreur: Error): void {
    // eslint-disable-next-line no-console
    console.warn("Erreur d'affichage :", erreur.message);
  }

  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <View style={styles.page}>
        <Text style={styles.titre}>Un problème est survenu</Text>
        <Text style={styles.texte}>
          Votre travail n'est pas perdu : tout ce qui a été enregistré est conservé sur ce téléphone et sera envoyé dès que possible.
        </Text>
        <Pressable style={styles.bouton} onPress={() => this.setState({ erreur: null })} accessibilityRole="button">
          <Text style={styles.boutonTexte}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100, alignItems: "center", justifyContent: "center", padding: espacements.s6, gap: espacements.s3 },
  titre: { fontSize: 18, fontWeight: "700", color: couleurs.navy, textAlign: "center" },
  texte: { fontSize: 14, color: couleurs.encreAttenuee, textAlign: "center" },
  bouton: { minHeight: 48, paddingHorizontal: espacements.s6, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
