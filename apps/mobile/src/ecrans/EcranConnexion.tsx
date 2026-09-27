import * as React from "react";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { couleurs, espacements, rayons } from "../tokens";

export interface EcranConnexionProps {
  emailInitial?: string;
  message?: string | null;
  erreur: string | null;
  enCours: boolean;
  onConnexion: (email: string, motDePasse: string) => void;
  onRetour?: () => void;
  onCreerCompte?: () => void;
}

export function EcranConnexion({ emailInitial, message, erreur, enCours, onConnexion, onRetour, onCreerCompte }: EcranConnexionProps) {
  const [email, setEmail] = useState(emailInitial ?? "");
  const [motDePasse, setMotDePasse] = useState("");

  return (
    <View style={styles.page}>
      <View style={styles.carte}>
        <Image
          source={require("../../assets/hotelsaver-logo.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <Text style={styles.titre}>HotelSaver</Text>
        <Text style={styles.adresse}>Gestion hôtelière</Text>

        {message && <Text style={styles.message}>{message}</Text>}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.champ}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="vous@exemple.com"
          placeholderTextColor={couleurs.encreFaible}
        />

        <Text style={styles.label}>Mot de passe</Text>
        <TextInput
          style={styles.champ}
          value={motDePasse}
          onChangeText={setMotDePasse}
          secureTextEntry
          textContentType="password"
          placeholder="••••••••"
          placeholderTextColor={couleurs.encreFaible}
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

        {onRetour && (
          <Pressable style={styles.boutonRetour} onPress={onRetour}>
            <Text style={styles.boutonRetourTexte}>Retour</Text>
          </Pressable>
        )}

        {onCreerCompte && (
          <Pressable style={styles.boutonRetour} onPress={onCreerCompte}>
            <Text style={styles.boutonRetourTexte}>Créer un compte hôtel</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface300, alignItems: "center", justifyContent: "center", padding: espacements.s5 },
  carte: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    padding: espacements.s6,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  logo: { width: 96, height: 96, alignSelf: "center", marginBottom: espacements.s3 },
  titre: { fontSize: 24, fontWeight: "700", color: couleurs.navy, textAlign: "center" },
  adresse: { fontSize: 12, color: couleurs.encreAttenuee, textAlign: "center", marginTop: 2, marginBottom: espacements.s4 },
  message: {
    fontSize: 13,
    color: couleurs.info,
    backgroundColor: couleurs.infoClair,
    padding: espacements.s3,
    borderRadius: rayons.sm,
    marginBottom: espacements.s3,
  },
  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginBottom: espacements.s1, marginTop: espacements.s2 },
  champ: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    height: 44,
    fontSize: 15,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
  },
  erreur: { color: couleurs.danger, fontSize: 13, marginTop: espacements.s3 },
  bouton: {
    marginTop: espacements.s4,
    height: 48,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonDesactive: { opacity: 0.6 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
  boutonRetour: { marginTop: espacements.s3, alignItems: "center", justifyContent: "center", height: 40 },
  boutonRetourTexte: { color: couleurs.encreAttenuee, fontWeight: "600" },
});
