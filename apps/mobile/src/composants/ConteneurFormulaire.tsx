import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { espacements } from "../tokens";

export interface ConteneurFormulaireProps {
  children: React.ReactNode;
  /** Style du contenu défilant (ex. centrage vertical pour la connexion). */
  styleContenu?: object;
}

/**
 * Wrapper unique pour les écrans-formulaires (retour terrain 28/09 — le
 * clavier masquait les champs du bas sur login, inscription, paramètres,
 * caisse…) : ScrollView qui défile + KeyboardAvoidingView. Le manifeste a
 * bien `adjustResize`, mais `edgeToEdgeEnabled=true` (gradle.properties)
 * rend ce mode inerte — la fenêtre ne redimensionne pas, le clavier recouvre
 * le bas des formulaires. `behavior="height"` fait le redimensionnement en
 * JS à la place. Résultat : le formulaire remonte quand le clavier s'ouvre,
 * reste scrollable, et revient en place quand le clavier se ferme.
 */
export function ConteneurFormulaire({ children, styleContenu }: ConteneurFormulaireProps) {
  return (
    <KeyboardAvoidingView style={styles.conteneur} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        style={styles.conteneur}
        contentContainerStyle={[styles.contenu, styleContenu]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  conteneur: { flex: 1 },
  contenu: { flexGrow: 1, padding: espacements.s4, paddingBottom: espacements.s7 },
});
