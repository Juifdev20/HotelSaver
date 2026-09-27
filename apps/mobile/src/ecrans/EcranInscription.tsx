import * as React from "react";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { InscriptionHotelPayload } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";

export interface EcranInscriptionProps {
  erreur: string | null;
  enCours: boolean;
  onSoumettre: (dto: InscriptionHotelPayload) => void;
  onRetourConnexion: () => void;
}

const REGEX_SOUS_DOMAINE = /^[a-z0-9-]+$/;

/** Écran purement présentationnel (comme EcranConnexion) : 2 étapes gérées
 * par un état local, pas par un routeur — apps/mobile n'a aucun routeur au
 * niveau racine (voir App.tsx, aiguillage par état). Pas d'étape logo
 * (voir DECISIONS.md, Phase 6) : l'hôtel démarre avec la palette générique. */
export function EcranInscription({ erreur, enCours, onSoumettre, onRetourConnexion }: EcranInscriptionProps) {
  const [etape, setEtape] = useState<1 | 2>(1);

  const [nom, setNom] = useState("");
  const [sousDomaine, setSousDomaine] = useState("");
  const [telephoneContact, setTelephoneContact] = useState("");
  const [adresse, setAdresse] = useState("");

  const [nomProprietaire, setNomProprietaire] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmationMotDePasse, setConfirmationMotDePasse] = useState("");
  const [erreurLocale, setErreurLocale] = useState<string | null>(null);

  function validerEtape1(): string | null {
    if (!nom.trim()) return "Le nom de l'hôtel est obligatoire.";
    if (!REGEX_SOUS_DOMAINE.test(sousDomaine)) {
      return "Le sous-domaine ne doit contenir que des minuscules, chiffres et tirets (ex. hotel-chicago).";
    }
    return null;
  }

  function passerEtape2() {
    const erreurValidation = validerEtape1();
    setErreurLocale(erreurValidation);
    if (!erreurValidation) setEtape(2);
  }

  function soumettre() {
    if (!nomProprietaire.trim()) return setErreurLocale("Votre nom est obligatoire.");
    if (!email.trim()) return setErreurLocale("L'email est obligatoire.");
    if (motDePasse.length < 8) return setErreurLocale("Le mot de passe doit contenir au moins 8 caractères.");
    if (motDePasse !== confirmationMotDePasse) return setErreurLocale("Les deux mots de passe ne correspondent pas.");

    setErreurLocale(null);
    onSoumettre({
      nom: nom.trim(),
      sousDomaine,
      telephoneContact: telephoneContact.trim() || undefined,
      adresse: adresse.trim() || undefined,
      nomProprietaire: nomProprietaire.trim(),
      email: email.trim(),
      motDePasse,
    });
  }

  const erreurAffichee = erreurLocale ?? erreur;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.contenu}>
        <View style={styles.carte}>
          <Image source={require("../../assets/hotelsaver-logo.png")} style={styles.logo} resizeMode="contain" />
          <Text style={styles.titre}>Créer un compte hôtel</Text>
          <Text style={styles.sousTitre}>{etape === 1 ? "Étape 1 sur 2 — Votre hôtel" : "Étape 2 sur 2 — Votre compte"}</Text>

          {etape === 1 && (
            <>
              <Text style={styles.label}>Nom de l'hôtel</Text>
              <TextInput
                style={styles.champ}
                value={nom}
                onChangeText={setNom}
                placeholder="Hôtel Chicago"
                placeholderTextColor={couleurs.encreFaible}
              />

              <Text style={styles.label}>Sous-domaine</Text>
              <TextInput
                style={styles.champ}
                value={sousDomaine}
                onChangeText={(v) => setSousDomaine(v.toLowerCase())}
                autoCapitalize="none"
                placeholder="hotel-chicago"
                placeholderTextColor={couleurs.encreFaible}
              />

              <Text style={styles.label}>Téléphone (optionnel)</Text>
              <TextInput
                style={styles.champ}
                value={telephoneContact}
                onChangeText={setTelephoneContact}
                keyboardType="phone-pad"
                placeholderTextColor={couleurs.encreFaible}
              />

              <Text style={styles.label}>Adresse (optionnel)</Text>
              <TextInput
                style={styles.champ}
                value={adresse}
                onChangeText={setAdresse}
                placeholderTextColor={couleurs.encreFaible}
              />

              {erreurAffichee && (
                <Text style={styles.erreur} accessibilityRole="alert">
                  {erreurAffichee}
                </Text>
              )}

              <Pressable style={styles.bouton} onPress={passerEtape2}>
                <Text style={styles.boutonTexte}>Continuer</Text>
              </Pressable>
            </>
          )}

          {etape === 2 && (
            <>
              <Text style={styles.label}>Votre nom</Text>
              <TextInput
                style={styles.champ}
                value={nomProprietaire}
                onChangeText={setNomProprietaire}
                placeholderTextColor={couleurs.encreFaible}
              />

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.champ}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholderTextColor={couleurs.encreFaible}
              />

              <Text style={styles.label}>Mot de passe</Text>
              <TextInput
                style={styles.champ}
                value={motDePasse}
                onChangeText={setMotDePasse}
                secureTextEntry
                textContentType="newPassword"
                placeholder="8 caractères minimum"
                placeholderTextColor={couleurs.encreFaible}
              />

              <Text style={styles.label}>Confirmer le mot de passe</Text>
              <TextInput
                style={styles.champ}
                value={confirmationMotDePasse}
                onChangeText={setConfirmationMotDePasse}
                secureTextEntry
                textContentType="newPassword"
                placeholderTextColor={couleurs.encreFaible}
              />

              {erreurAffichee && (
                <Text style={styles.erreur} accessibilityRole="alert">
                  {erreurAffichee}
                </Text>
              )}

              <Pressable style={[styles.bouton, enCours && styles.boutonDesactive]} onPress={soumettre} disabled={enCours}>
                {enCours ? <ActivityIndicator color="#fff" /> : <Text style={styles.boutonTexte}>Créer mon compte</Text>}
              </Pressable>

              <Pressable style={styles.boutonRetour} onPress={() => setEtape(1)}>
                <Text style={styles.boutonRetourTexte}>Retour</Text>
              </Pressable>
            </>
          )}

          <Pressable style={styles.boutonRetour} onPress={onRetourConnexion}>
            <Text style={styles.boutonRetourTexte}>J'ai déjà un compte</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface300 },
  contenu: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: espacements.s5 },
  carte: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    padding: espacements.s6,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  logo: { width: 72, height: 72, alignSelf: "center", marginBottom: espacements.s2 },
  titre: { fontSize: 22, fontWeight: "700", color: couleurs.navy, textAlign: "center" },
  sousTitre: { fontSize: 13, color: couleurs.encreAttenuee, textAlign: "center", marginTop: 2, marginBottom: espacements.s4 },
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
