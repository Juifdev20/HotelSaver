import * as React from "react";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Lock, Mail } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { EnteteAuth } from "../composants/EnteteAuth";
import { ChampAuth } from "../composants/ChampAuth";

export interface EcranConnexionProps {
  emailInitial?: string;
  message?: string | null;
  erreur: string | null;
  enCours: boolean;
  onConnexion: (email: string, motDePasse: string) => void;
  onRetour?: () => void;
  onCreerCompte?: () => void;
}

/** Bandeau navy + feuille blanche arrondie (maquette). Pas de « mot de passe
 * oublié » ni de « se souvenir de moi » : aucun des deux n'existe côté API, et
 * la session est déjà mémorisée par profil (voir DECISIONS.md, Phase 16). */
export function EcranConnexion({ emailInitial, message, erreur, enCours, onConnexion, onRetour, onCreerCompte }: EcranConnexionProps) {
  const [email, setEmail] = useState(emailInitial ?? "");
  const [motDePasse, setMotDePasse] = useState("");

  return (
    <View style={styles.page}>
      <EnteteAuth />
      <View style={styles.feuille}>
        <ConteneurFormulaire styleContenu={styles.contenu}>
          <Text style={styles.titre}>Bon retour 👋</Text>
          <Text style={styles.sousTitre}>Connectez-vous à votre espace hôtelier.</Text>

          {message && <Text style={styles.message}>{message}</Text>}

          <ChampAuth
            libelle="Adresse e-mail"
            icone={Mail}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="ex. hotel@monetablissement.com"
          />
          <ChampAuth
            libelle="Mot de passe"
            icone={Lock}
            value={motDePasse}
            onChangeText={setMotDePasse}
            secureTextEntry
            textContentType="password"
            placeholder="Votre mot de passe"
          />

          {erreur && (
            <Text style={styles.erreur} accessibilityRole="alert">
              {erreur}
            </Text>
          )}

          <Pressable
            style={[styles.bouton, enCours && styles.boutonDesactive]}
            onPress={() => onConnexion(email.trim(), motDePasse)}
            disabled={enCours}
          >
            {enCours ? <ActivityIndicator color="#fff" /> : <Text style={styles.boutonTexte}>Se connecter</Text>}
          </Pressable>

          {onCreerCompte && (
            <>
              <View style={styles.separateur}>
                <View style={styles.trait} />
                <Text style={styles.separateurTexte}>Ou</Text>
                <View style={styles.trait} />
              </View>
              <Pressable style={styles.boutonContour} onPress={onCreerCompte}>
                <Text style={styles.boutonContourTexte}>Créer un compte</Text>
              </Pressable>
            </>
          )}

          {onRetour && (
            <Pressable style={styles.boutonRetour} onPress={onRetour}>
              <Text style={styles.boutonRetourTexte}>Retour</Text>
            </Pressable>
          )}
        </ConteneurFormulaire>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fond navy : il se prolonge derrière les coins arrondis de la feuille.
  page: { flex: 1, backgroundColor: couleurs.navy },
  feuille: {
    flex: 1,
    marginTop: -espacements.s5,
    backgroundColor: couleurs.surface200,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  contenu: { padding: espacements.s5, paddingTop: espacements.s5 + espacements.s2 },
  titre: { fontSize: 26, fontWeight: "700", color: couleurs.navy },
  sousTitre: { fontSize: 14, color: couleurs.encreAttenuee, marginTop: 4, marginBottom: espacements.s5 },
  message: {
    fontSize: 13,
    color: couleurs.info,
    backgroundColor: couleurs.infoClair,
    padding: espacements.s3,
    borderRadius: rayons.sm,
    marginBottom: espacements.s3,
  },
  erreur: {
    color: "#B42318",
    backgroundColor: couleurs.dangerClair,
    fontSize: 13,
    padding: espacements.s3,
    borderRadius: rayons.sm,
    marginBottom: espacements.s2,
  },
  bouton: {
    marginTop: espacements.s2,
    height: 52,
    borderRadius: rayons.md,
    backgroundColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonDesactive: { opacity: 0.6 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 16 },
  separateur: { flexDirection: "row", alignItems: "center", gap: espacements.s3, marginVertical: espacements.s4 },
  trait: { flex: 1, height: 1, backgroundColor: couleurs.bordure },
  separateurTexte: { color: couleurs.encreFaible, fontSize: 13 },
  boutonContour: {
    height: 52,
    borderRadius: rayons.md,
    borderWidth: 1.5,
    borderColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonContourTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 16 },
  boutonRetour: { marginTop: espacements.s3, alignItems: "center", justifyContent: "center", height: 44 },
  boutonRetourTexte: { color: couleurs.encreAttenuee, fontWeight: "600" },
});
