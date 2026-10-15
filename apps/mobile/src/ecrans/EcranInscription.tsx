import * as React from "react";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { ArrowRight, Building2, Globe, Lock, MapPin, User } from "lucide-react-native";
import type { InscriptionHotelPayload } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { PageAuth } from "../composants/PageAuth";
import { ChampAuth } from "../composants/ChampAuth";
import { EtapesAuth } from "../composants/EtapesAuth";
import { ChampTelephone, telephoneDepuisSaisie } from "../composants/ChampTelephone";

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
 * (voir DECISIONS.md, Phase 6) : l'hôtel démarre avec la palette générique.
 * Depuis le 15/10/2026, le **numéro du patron** (étape 2) est son identifiant
 * de connexion ; l'e-mail est optionnel. */
export function EcranInscription({ erreur, enCours, onSoumettre, onRetourConnexion }: EcranInscriptionProps) {
  const [etape, setEtape] = useState<1 | 2>(1);

  const [nom, setNom] = useState("");
  const [sousDomaine, setSousDomaine] = useState("");
  const [adresse, setAdresse] = useState("");

  const [nomProprietaire, setNomProprietaire] = useState("");
  const [telephoneProprietaire, setTelephoneProprietaire] = useState("");
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
    const telephone = telephoneDepuisSaisie(telephoneProprietaire);
    if (!telephone) return setErreurLocale("Numéro invalide : 9 chiffres commençant par 8 ou 9 (ex. 970 000 000).");
    if (motDePasse.length < 8) return setErreurLocale("Le mot de passe doit contenir au moins 8 caractères.");
    if (motDePasse !== confirmationMotDePasse) return setErreurLocale("Les deux mots de passe ne correspondent pas.");

    setErreurLocale(null);
    onSoumettre({
      nom: nom.trim(),
      sousDomaine,
      adresse: adresse.trim() || undefined,
      nomProprietaire: nomProprietaire.trim(),
      telephoneProprietaire: telephone,
      motDePasse,
    });
  }

  const erreurAffichee = erreurLocale ?? erreur;

  return (
    <PageAuth
      onRetour={
        etape === 2
          ? () => {
              setErreurLocale(null);
              setEtape(1);
            }
          : undefined
      }
    >
          <EtapesAuth etape={etape} />
          <Text style={[styles.titre, etape === 2 && { marginBottom: 14 }]}>Créez votre hôtel</Text>
          {/* Étape 2 sans sous-titre ni e-mail (retour du patron, 15/10/2026) :
           * tout tient à l'écran sans défiler. L'e-mail, optionnel, s'ajoute
           * après l'inscription (Utilisateurs → Modifier, son propre compte). */}
          {etape === 1 && (
            <Text style={styles.sousTitre} numberOfLines={1} adjustsFontSizeToFit>
              Quelques informations suffisent pour commencer.
            </Text>
          )}

          {etape === 1 && (
            <>
              <ChampAuth
                libelle="Nom de l'hôtel *"
                icone={Building2}
                value={nom}
                onChangeText={setNom}
                valide={nom.trim().length > 1}
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
                placeholder="mon-etablissement"
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

              <Pressable style={styles.bouton} onPress={passerEtape2}>
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
                placeholder="Ex. Jean Mukendi"
              />
              <ChampTelephone
                libelle="Numéro de téléphone *"
                value={telephoneProprietaire}
                onChangeText={setTelephoneProprietaire}
              />
              <ChampAuth
                libelle="Mot de passe *"
                icone={Lock}
                value={motDePasse}
                onChangeText={setMotDePasse}
                secureTextEntry
                textContentType="newPassword"
                placeholder="Minimum 8 caractères"
              />
              <ChampAuth
                libelle="Confirmer le mot de passe *"
                icone={Lock}
                value={confirmationMotDePasse}
                onChangeText={setConfirmationMotDePasse}
                secureTextEntry
                textContentType="newPassword"
              />

              {erreurAffichee && (
                <Text style={styles.erreur} accessibilityRole="alert">
                  {erreurAffichee}
                </Text>
              )}

              <Pressable style={[styles.bouton, enCours && styles.boutonDesactive]} onPress={soumettre} disabled={enCours}>
                {enCours ? <ActivityIndicator color="#fff" /> : <Text style={styles.boutonTexte}>Créer mon compte</Text>}
              </Pressable>
            </>
          )}

          <Pressable style={styles.lienConnexion} onPress={onRetourConnexion}>
            <Text style={styles.boutonRetourTexte}>
              Vous avez déjà un compte ?{"  "}<Text style={styles.lien}>Se connecter</Text>
            </Text>
          </Pressable>
    </PageAuth>
  );
}

const styles = StyleSheet.create({
  // Maquette du 15/10/2026 (seconde version) : titre et sous-titre centrés.
  titre: { fontSize: 28, fontWeight: "800", color: couleurs.navy, letterSpacing: -0.3, textAlign: "center" },
  sousTitre: { fontSize: 14, color: "#5B6B8C", marginTop: 2, marginBottom: 14, textAlign: "center" },
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
    height: 48,
    borderRadius: 12,
    backgroundColor: couleurs.bleu,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonDesactive: { opacity: 0.6 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 16 },
  // Collé sous le bouton principal : tout tient à l'écran sans défiler.
  lienConnexion: { marginTop: 6, alignItems: "center", justifyContent: "center", height: 30 },
  boutonRetourTexte: { color: "#3B4A63", fontSize: 14 },
  lien: { color: couleurs.bleu, fontWeight: "700" },
});
