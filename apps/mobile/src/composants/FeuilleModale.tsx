import * as React from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { couleurs, espacements, rayons } from "../tokens";

export interface FeuilleModaleProps {
  visible: boolean;
  onFermer: () => void;
  titre?: string;
  children: React.ReactNode;
  /** false pour un contenu qui apporte déjà sa propre liste virtualisée
   * (ex. SelecteurProduit et sa FlatList) — imbriquer une FlatList dans ce
   * ScrollView casse le défilement/génère l'avertissement RN "VirtualizedLists
   * should never be nested inside plain ScrollViews". Par défaut true : sans
   * ça, le clavier masque les derniers champs d'un formulaire à plusieurs
   * lignes (constaté sur l'appareil réel avec Nom/Catégorie/Prix/Seuil du
   * formulaire Menu) sans aucun moyen de les atteindre. Sur Android,
   * behavior="height" du KeyboardAvoidingView ci-dessous est en plus
   * obligatoire : une Modal RN est une fenêtre séparée, `adjustResize` du
   * manifeste ne l'atteint pas — le clavier couvrait les champs du bas
   * (retour du patron 28/09). */
  avecDefilement?: boolean;
  /** Un champ a été modifié : toucher le fond ou le bouton Retour d'Android ne ferme plus la feuille d'un coup (la saisie
   * serait perdue, retour U12) — on demande d'abord « Abandonner la saisie ? ». */
  modifie?: boolean;
  /** Envoi en cours : le fond et le bouton Retour sont ignorés, la feuille reste ouverte jusqu'à la réponse. */
  enCours?: boolean;
}

export function FeuilleModale({ visible, onFermer, titre, children, avecDefilement = true, modifie = false, enCours = false }: FeuilleModaleProps) {
  /** Fermeture « indirecte » (fond, Retour d'Android) : jamais pendant un envoi, avec confirmation si une saisie existe. */
  function demanderFermeture() {
    if (enCours) return;
    if (!modifie) return onFermer();
    Alert.alert("Abandonner la saisie ?", "Ce que vous avez écrit sera perdu.", [
      { text: "Continuer la saisie", style: "cancel" },
      { text: "Abandonner", style: "destructive", onPress: onFermer },
    ]);
  }

  const contenu = (
    <>
      <View style={styles.poignee} />
      {titre && (
        <Text style={styles.titre} accessibilityRole="header">
          {titre}
        </Text>
      )}
      {children}
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={demanderFermeture}>
      <KeyboardAvoidingView style={styles.fond} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={styles.fondPressable} onPress={demanderFermeture} accessible={false}>
          <Pressable style={styles.feuille} onPress={(e) => e.stopPropagation()}>
            {avecDefilement ? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.contenuScroll}>
                {contenu}
              </ScrollView>
            ) : (
              <View style={styles.contenuScroll}>{contenu}</View>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1 },
  fondPressable: { flex: 1, backgroundColor: "rgba(15,39,66,0.4)", justifyContent: "flex-end" },
  feuille: {
    backgroundColor: couleurs.surface200,
    borderTopLeftRadius: rayons.lg,
    borderTopRightRadius: rayons.lg,
    maxHeight: "85%",
  },
  contenuScroll: { padding: espacements.s5, gap: espacements.s3 },
  poignee: {
    width: 40,
    height: 4,
    borderRadius: rayons.pill,
    backgroundColor: couleurs.bordure,
    alignSelf: "center",
    marginBottom: espacements.s2,
  },
  titre: { fontSize: 17, fontWeight: "700", color: couleurs.encre },
});
