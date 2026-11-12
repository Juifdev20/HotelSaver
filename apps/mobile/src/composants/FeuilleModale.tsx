import * as React from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
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
  /** Zone fixe sous le contenu, hors défilement (ex. « Imprimer le reçu ») : un contenu long (reçu de 20 lignes) défile
   * seul, ces boutons restent toujours visibles (retour du patron 18/10/2026). */
  pied?: React.ReactNode;
}

export function FeuilleModale({ visible, onFermer, titre, children, avecDefilement = true, modifie = false, enCours = false, pied }: FeuilleModaleProps) {
  const { height: hauteurFenetre } = useWindowDimensions();
  // Hauteur maximale EN PIXELS (et non en %) : la zone qui défile a toujours une hauteur bornée, donc défile vraiment, même quand le clavier
  // réduit la fenêtre.
  /** Fermeture « indirecte » (fond, Retour d'Android) : jamais pendant un envoi, avec confirmation si une saisie existe. */
  function demanderFermeture() {
    if (enCours) return;
    if (!modifie) return onFermer();
    Alert.alert("Abandonner la saisie ?", "Ce que vous avez écrit sera perdu.", [
      { text: "Continuer la saisie", style: "cancel" },
      { text: "Abandonner", style: "destructive", onPress: onFermer },
    ]);
  }

  const entete = (
    <>
      <View style={styles.poignee} />
      {titre && (
        <Text style={styles.titre} accessibilityRole="header">
          {titre}
        </Text>
      )}
    </>
  );
  // Avec un pied (reçu, étiquettes) : l'en-tête reste fixe lui aussi — seul le contenu défile, il ne « coupe » plus le haut de
  // la feuille en remontant (retour du patron 19/10/2026).
  const contenu = pied ? children : (
    <>
      {entete}
      {children}
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={demanderFermeture}>
      <KeyboardAvoidingView style={styles.fond} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {/* Le fond est un FRÈRE de la feuille, pas son parent : sur Android un parent « appuyable » capte le geste de défilement du contenu
            (la feuille ne défilait qu'en forçant, retour du patron 12/11/2026). */}
        <Pressable style={StyleSheet.absoluteFill} onPress={demanderFermeture} accessible={false} />
        <View style={[styles.feuille, { maxHeight: hauteurFenetre * (pied ? 0.94 : 0.88) }]}>
          {pied && <View style={styles.enteteFixe}>{entete}</View>}
          {avecDefilement ? (
            <ScrollView
              style={styles.zoneDefilante}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              contentContainerStyle={styles.contenuScroll}
            >
              {contenu}
            </ScrollView>
          ) : (
            <View style={[styles.zoneDefilante, styles.contenuScroll]}>{contenu}</View>
          )}
          {pied && <View style={styles.pied}>{pied}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: "rgba(15,39,66,0.4)", justifyContent: "flex-end" },
  feuille: {
    backgroundColor: couleurs.surface200,
    borderTopLeftRadius: rayons.lg,
    borderTopRightRadius: rayons.lg,
  },
  enteteFixe: {
    paddingHorizontal: espacements.s5,
    paddingTop: espacements.s3,
    paddingBottom: espacements.s2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: couleurs.bordure,
  },
  zoneDefilante: { flexShrink: 1 },
  pied: {
    paddingHorizontal: espacements.s5,
    paddingTop: espacements.s3,
    paddingBottom: espacements.s5,
    gap: espacements.s2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.bordure,
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
