import * as React from "react";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight, Building2, Globe, Lock, Mail, MapPin, Phone, User } from "lucide-react-native";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import type { InscriptionHotelPayload } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteAuth } from "../composants/EnteteAuth";
import { ChampAuth } from "../composants/ChampAuth";
import { EtapesAuth } from "../composants/EtapesAuth";
import { useRetourAndroid } from "../hooks/useRetourAndroid";
import { confirmerAction } from "../confirmer";

export interface EcranInscriptionProps {
  erreur: string | null;
  enCours: boolean;
  /** `payerMaintenant` : le patron veut payer son abonnement tout de suite ; l'application lui ouvre l'écran Abonnement à sa première ouverture. */
  onSoumettre: (dto: InscriptionHotelPayload, payerMaintenant: boolean) => void;
  onRetourConnexion: () => void;
}

const REGEX_SOUS_DOMAINE = /^[a-z0-9-]+$/;

/** Écran purement présentationnel (comme EcranConnexion) : 2 étapes gérées
 * par un état local, pas par un routeur — apps/mobile n'a aucun routeur au
 * niveau racine (voir App.tsx, aiguillage par état). Pas d'étape logo
 * (voir DECISIONS.md, Phase 6) : l'hôtel démarre avec la palette générique. */
export function EcranInscription({ erreur, enCours, onSoumettre, onRetourConnexion }: EcranInscriptionProps) {
  const [etape, setEtape] = useState<1 | 2>(1);
  const [payerMaintenant, setPayerMaintenant] = useState(false);

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
    }, payerMaintenant);
  }

  const erreurAffichee = erreurLocale ?? erreur;

  /** Bouton Retour d'Android : étape 2 → étape 1 (la saisie est gardée) ; étape 1 → connexion, avec confirmation si on a déjà écrit. */
  useRetourAndroid(() => {
    if (enCours) return true;
    if (etape === 2) {
      setErreurLocale(null);
      setEtape(1);
      return true;
    }
    if (nom.trim() || sousDomaine || telephoneContact.trim() || adresse.trim()) {
      confirmerAction({
        titre: "Abandonner l'inscription ?",
        message: "Les informations saisies seront perdues.",
        libelleConfirmer: "Abandonner",
        libelleRefuser: "Continuer l'inscription",
        destructif: true,
        onConfirmer: onRetourConnexion,
      });
    } else {
      onRetourConnexion();
    }
    return true;
  });

  return (
    <View style={styles.page}>
      <EnteteAuth />
      <View style={styles.feuille}>
        <ConteneurFormulaire styleContenu={styles.contenu}>
          <EtapesAuth etape={etape} />
          <Text style={styles.titre}>Créez votre hôtel</Text>
          <Text style={styles.sousTitre}>
            {etape === 1
              ? "Quelques informations suffisent pour commencer."
              : "Dernière étape : le compte du patron, qui gérera les accès de l'équipe."}
          </Text>

          {etape === 1 && (
            <>
              <ChampAuth
                libelle="Nom de l'hôtel *"
                icone={Building2}
                value={nom}
                onChangeText={setNom}
                valide={nom.trim().length > 1}
                autoComplete="organization"
                placeholder="Ex. Hôtel Le Grand Bleu"
              />
              <ChampAuth
                libelle="Sous-domaine *"
                icone={Globe}
                value={sousDomaine}
                onChangeText={(v) => setSousDomaine(v.toLowerCase())}
                valide={REGEX_SOUS_DOMAINE.test(sousDomaine)}
                suffixe=".hotelsaver.com"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="hotel-mon-etablissement"
              />
              <ChampAuth
                libelle="Téléphone (optionnel)"
                icone={Phone}
                value={telephoneContact}
                onChangeText={setTelephoneContact}
                keyboardType="phone-pad"
                autoComplete="tel"
                placeholder="Ex. +243 970 000 000"
              />
              <ChampAuth
                libelle="Adresse (optionnelle)"
                icone={MapPin}
                value={adresse}
                onChangeText={setAdresse}
                placeholder="Ex. Avenue de la Paix, Goma"
              />

              {erreurAffichee && (
                <Text style={styles.erreur} accessibilityRole="alert">
                  {erreurAffichee}
                </Text>
              )}

              <Pressable style={styles.bouton} onPress={passerEtape2} accessibilityRole="button" accessibilityLabel="Continuer vers l'étape 2">
                <Text style={styles.boutonTexte}>Continuer</Text>
                <ArrowRight size={18} color="#fff" />
              </Pressable>
            </>
          )}

          {etape === 2 && (
            <>
              <ChampAuth
                libelle="Votre nom *"
                icone={User}
                value={nomProprietaire}
                onChangeText={setNomProprietaire}
                valide={nomProprietaire.trim().length > 1}
                autoComplete="name"
                placeholder="Ex. Jean Mukendi"
              />
              <ChampAuth
                libelle="Adresse e-mail *"
                icone={Mail}
                value={email}
                onChangeText={setEmail}
                valide={/^\S+@\S+\.\S+$/.test(email)}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                placeholder="ex. hotel@monetablissement.com"
              />
              <ChampAuth
                libelle="Mot de passe *"
                icone={Lock}
                value={motDePasse}
                onChangeText={setMotDePasse}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="new-password"
                placeholder="Minimum 8 caractères"
              />
              <ChampAuth
                libelle="Confirmer le mot de passe *"
                icone={Lock}
                value={confirmationMotDePasse}
                onChangeText={setConfirmationMotDePasse}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="new-password"
                returnKeyType="go"
                onSubmitEditing={soumettre}
              />

              <View accessibilityRole="radiogroup" accessibilityLabel="Comment voulez-vous commencer ?" style={styles.demarrage}>
                <Text style={styles.demarrageTitre}>Comment voulez-vous commencer ?</Text>
                {(
                  [
                    [false, "Essai gratuit", "Testez toutes les fonctions sans payer. Vous choisirez votre formule plus tard."],
                    [true, "Payer mon abonnement maintenant", "Pour ne plus y penser. Vos jours d'essai ne sont pas perdus : ils s'ajoutent à votre abonnement."],
                  ] as const
                ).map(([valeur, titre, detail]) => (
                  <Pressable
                    key={titre}
                    style={[styles.choix, payerMaintenant === valeur && styles.choixActif]}
                    onPress={() => setPayerMaintenant(valeur)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: payerMaintenant === valeur }}
                    accessibilityLabel={`${titre}. ${detail}`}
                  >
                    <Text style={styles.choixTitre}>{titre}</Text>
                    <Text style={styles.choixDetail}>{detail}</Text>
                  </Pressable>
                ))}
              </View>

              {erreurAffichee && (
                <Text style={styles.erreur} accessibilityRole="alert">
                  {erreurAffichee}
                </Text>
              )}

              <Pressable
                style={[styles.bouton, enCours && styles.boutonDesactive]}
                onPress={soumettre}
                disabled={enCours}
                accessibilityRole="button"
                accessibilityLabel={enCours ? "Création du compte en cours" : "Créer mon compte"}
                accessibilityState={{ disabled: enCours, busy: enCours }}
              >
                {enCours ? <ActivityIndicator color="#fff" /> : <Text style={styles.boutonTexte}>Créer mon compte</Text>}
              </Pressable>

              <Pressable
                style={styles.boutonRetour}
                onPress={() => {
                  setErreurLocale(null);
                  setEtape(1);
                }}
                accessibilityRole="button"
                accessibilityLabel="Retour à l'étape 1"
              >
                <Text style={styles.boutonRetourTexte}>Retour</Text>
              </Pressable>
            </>
          )}

          <Pressable style={styles.boutonRetour} onPress={onRetourConnexion} accessibilityRole="button" accessibilityLabel="Vous avez déjà un compte ? Se connecter">
            <Text style={styles.boutonRetourTexte}>
              Vous avez déjà un compte ? <Text style={styles.lien}>Se connecter</Text>
            </Text>
          </Pressable>
        </ConteneurFormulaire>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  titre: { fontSize: 26, fontWeight: "700", color: couleurs.navy, textAlign: "center" },
  sousTitre: { fontSize: 14, color: couleurs.encreAttenuee, textAlign: "center", marginTop: 4, marginBottom: espacements.s5 },
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
    minHeight: 52,
    borderRadius: rayons.md,
    backgroundColor: couleurs.bleu,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonDesactive: { opacity: 0.6 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 16 },
  boutonRetour: { marginTop: espacements.s3, alignItems: "center", justifyContent: "center", minHeight: 44 },
  boutonRetourTexte: { color: couleurs.encreAttenuee, fontWeight: "600" },
  lien: { color: couleurs.bleu, fontWeight: "700" },
  demarrage: { gap: espacements.s2, marginTop: espacements.s3, marginBottom: espacements.s2 },
  demarrageTitre: { fontSize: 15, fontWeight: "700", color: couleurs.navy },
  choix: { borderWidth: 2, borderColor: couleurs.bordure, borderRadius: rayons.md, padding: espacements.s3, gap: 2, minHeight: 56 },
  choixActif: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  choixTitre: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  choixDetail: { fontSize: 13, color: couleurs.encreAttenuee },
});
