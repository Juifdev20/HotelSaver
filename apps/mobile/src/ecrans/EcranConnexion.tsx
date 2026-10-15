import * as React from "react";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight, Hotel, Lock, Mail, MailCheck, ShieldCheck } from "lucide-react-native";
import { formaterSaisieRdc } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { PageAuth } from "../composants/PageAuth";
import { ChampAuth } from "../composants/ChampAuth";
import { ChampTelephone, telephoneDepuisSaisie } from "../composants/ChampTelephone";

export interface EcranConnexionProps {
  /** Numéro (« +243… ») ou e-mail d'un ancien compte, pour pré-remplir. */
  identifiantInitial?: string;
  message?: string | null;
  erreur: string | null;
  enCours: boolean;
  /** `identifiant` : numéro normalisé « +243XXXXXXXXX », ou e-mail (ancien compte). */
  onConnexion: (identifiant: string, motDePasse: string) => void;
  onRetour?: () => void;
  onCreerCompte?: () => void;
  /** « Mot de passe oublié » ; rejette avec un message lisible en cas d'échec. */
  onMotDePasseOublie?: (identifiant: string) => Promise<void>;
}

/** Saisie du champ téléphone à partir d'un numéro normalisé « +243970000000 ». */
function saisieDepuis(identifiant?: string): string {
  return identifiant && !identifiant.includes("@") ? formaterSaisieRdc(identifiant.replace(/^\+243/, "")) : "";
}

/** Maquette du 15/10/2026 (seconde version) : connexion par **numéro de
 * téléphone** + mot de passe, pour tous les rôles. Un ancien compte sans
 * numéro peut encore passer par son e-mail (« Ancien compte ? … ») tant que
 * le patron ne lui a pas ajouté de numéro (voir DECISIONS.md). */
export function EcranConnexion({
  identifiantInitial,
  message,
  erreur,
  enCours,
  onConnexion,
  onRetour,
  onCreerCompte,
  onMotDePasseOublie,
}: EcranConnexionProps) {
  const [parEmail, setParEmail] = useState(!!identifiantInitial?.includes("@"));
  const [telephone, setTelephone] = useState(saisieDepuis(identifiantInitial));
  const [email, setEmail] = useState(identifiantInitial?.includes("@") ? identifiantInitial : "");
  const [motDePasse, setMotDePasse] = useState("");
  const [mode, setMode] = useState<"connexion" | "oubli">("connexion");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreurLocale, setErreurLocale] = useState<string | null>(null);

  /** Identifiant saisi (numéro normalisé ou e-mail), ou un message d'erreur. */
  function identifiant(): { valeur: string } | { erreur: string } {
    if (parEmail) {
      return /^\S+@\S+\.\S+$/.test(email.trim()) ? { valeur: email.trim() } : { erreur: "Saisissez une adresse e-mail valide." };
    }
    const numero = telephoneDepuisSaisie(telephone);
    return numero
      ? { valeur: numero }
      : { erreur: "Numéro invalide : 9 chiffres commençant par 8 ou 9 (ex. 970 000 000)." };
  }

  function seConnecter() {
    const id = identifiant();
    if ("erreur" in id) return setErreurLocale(id.erreur);
    setErreurLocale(null);
    onConnexion(id.valeur, motDePasse);
  }

  async function envoyerLien() {
    if (!onMotDePasseOublie) return;
    const id = identifiant();
    if ("erreur" in id) return setErreurLocale(id.erreur);
    setErreurLocale(null);
    setEnvoiEnCours(true);
    try {
      await onMotDePasseOublie(id.valeur);
      setEnvoye(true);
    } catch (e) {
      setErreurLocale(e instanceof Error ? e.message : "Envoi impossible. Réessayez.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  function retourConnexion() {
    setMode("connexion");
    setEnvoye(false);
    setErreurLocale(null);
  }

  const champIdentifiant = parEmail ? (
    <ChampAuth
      libelle="Adresse e-mail *"
      icone={Mail}
      value={email}
      onChangeText={setEmail}
      autoCapitalize="none"
      keyboardType="email-address"
      textContentType="emailAddress"
      placeholder="nom@hotel.com"
    />
  ) : (
    <ChampTelephone libelle="Numéro de téléphone *" value={telephone} onChangeText={setTelephone} />
  );

  const basculeEmail = (
    <Pressable
      style={styles.lienDiscret}
      onPress={() => {
        setParEmail((v) => !v);
        setErreurLocale(null);
      }}
      hitSlop={6}
      accessibilityRole="button"
    >
      <Text style={styles.lienDiscretTexte}>
        {parEmail ? "Se connecter avec un numéro de téléphone" : "Ancien compte ? Se connecter avec un e-mail"}
      </Text>
    </Pressable>
  );

  const erreurAffichee = erreurLocale ?? erreur;

  if (mode === "oubli") {
    return (
      <PageAuth>
        {envoye ? (
          <>
            <View style={styles.iconeSucces}>
              <MailCheck size={30} color={couleurs.bleu} />
            </View>
            <Text style={styles.titre}>Demande envoyée</Text>
            <Text style={styles.sousTitre}>
              Si une adresse e-mail est associée à ce compte, un lien pour choisir un nouveau mot de passe vient d'y être
              envoyé (pensez aux courriers indésirables).
            </Text>
            <View style={styles.carteInfo}>
              <View style={styles.carteInfoIcone}>
                <ShieldCheck size={24} color="#FFFFFF" fill={couleurs.bleu} strokeWidth={2} />
              </View>
              <Text style={styles.carteInfoTexte}>
                Pas d'e-mail sur votre compte ? Employé : demandez à votre patron de changer votre mot de passe. Patron :
                contactez le support HotelSaver.
              </Text>
            </View>
            <Pressable style={styles.bouton} onPress={retourConnexion}>
              <Text style={styles.boutonTexte}>Retour à la connexion</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.titre}>Mot de passe oublié ?</Text>
            <Text style={styles.sousTitre}>Saisissez le numéro de votre compte.</Text>
            {champIdentifiant}
            {basculeEmail}
            {erreurAffichee && (
              <Text style={styles.erreur} accessibilityRole="alert">
                {erreurAffichee}
              </Text>
            )}
            <Pressable style={[styles.bouton, envoiEnCours && styles.boutonDesactive]} onPress={envoyerLien} disabled={envoiEnCours}>
              {envoiEnCours ? <ActivityIndicator color="#fff" /> : <Text style={styles.boutonTexte}>Continuer</Text>}
            </Pressable>
            <Pressable style={styles.boutonRetour} onPress={retourConnexion}>
              <Text style={styles.boutonRetourTexte}>Retour à la connexion</Text>
            </Pressable>
          </>
        )}
      </PageAuth>
    );
  }

  return (
    <PageAuth>
      <Text style={styles.titre}>Ravi de vous revoir !</Text>
      <Text style={styles.sousTitre}>Connectez-vous à votre espace hôtelier.</Text>

      {/* Carte d'information seulement pour un message ponctuel (ex. après
       * l'inscription) : la carte par défaut a été retirée pour remonter le
       * formulaire et éviter de défiler (retour du patron, 15/10/2026). */}
      {message && (
        <View style={styles.carteInfo}>
          <View style={styles.carteInfoIcone}>
            <ShieldCheck size={24} color="#FFFFFF" fill={couleurs.bleu} strokeWidth={2} />
          </View>
          <Text style={styles.carteInfoTexte}>{message}</Text>
        </View>
      )}

      {champIdentifiant}
      <ChampAuth
        libelle="Mot de passe *"
        icone={Lock}
        value={motDePasse}
        onChangeText={setMotDePasse}
        secureTextEntry
        textContentType="password"
        placeholder="Votre mot de passe"
      />

      {onMotDePasseOublie && (
        <Pressable
          style={styles.lienOubli}
          onPress={() => {
            setMode("oubli");
            setErreurLocale(null);
          }}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={styles.lienOubliTexte}>Mot de passe oublié ?</Text>
        </Pressable>
      )}

      {erreurAffichee && (
        <Text style={styles.erreur} accessibilityRole="alert">
          {erreurAffichee}
        </Text>
      )}

      <Pressable style={[styles.bouton, enCours && styles.boutonDesactive]} onPress={seConnecter} disabled={enCours}>
        {enCours ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.boutonTexte}>Se connecter</Text>
            <ArrowRight size={18} color="#fff" />
          </>
        )}
      </Pressable>

      {onCreerCompte && (
        <>
          <View style={styles.separateur}>
            <View style={styles.trait} />
            <Text style={styles.separateurTexte}>ou</Text>
            <View style={styles.trait} />
          </View>
          <Pressable style={styles.boutonContour} onPress={onCreerCompte}>
            <Hotel size={20} color={couleurs.bleu} />
            <Text style={styles.boutonContourTexte}>Créer votre hôtel</Text>
          </Pressable>
          <Pressable style={styles.lienBas} onPress={onCreerCompte} hitSlop={6}>
            <Text style={styles.lienBasTexte}>
              Vous débutez avec HotelSaver ?{"  "}
              <Text style={styles.lien}>Créez votre hôtel</Text>
            </Text>
          </Pressable>
        </>
      )}

      {basculeEmail}

      {onRetour && (
        <Pressable style={styles.boutonRetour} onPress={onRetour}>
          <Text style={styles.boutonRetourTexte}>Retour</Text>
        </Pressable>
      )}
    </PageAuth>
  );
}

const styles = StyleSheet.create({
  titre: { fontSize: 28, fontWeight: "800", color: couleurs.navy, letterSpacing: -0.3, textAlign: "center" },
  sousTitre: { fontSize: 15, color: "#5B6B8C", marginTop: 4, marginBottom: 16, textAlign: "center" },
  carteInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#EEF4FE",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  carteInfoIcone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  carteInfoTexte: { flex: 1, fontSize: 13, lineHeight: 19, color: "#1A4FB5" },
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
  separateur: { flexDirection: "row", alignItems: "center", gap: espacements.s4, marginVertical: 10 },
  trait: { flex: 1, height: 1, backgroundColor: "#DCE4F0" },
  separateurTexte: { color: "#5B6B8C", fontSize: 14 },
  boutonContour: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: couleurs.bleu,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonContourTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 16 },
  lienBas: { alignItems: "center", marginTop: 14 },
  lienBasTexte: { fontSize: 13.5, color: "#3B4A63" },
  lien: { color: couleurs.bleu, fontWeight: "700" },
  iconeSucces: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: couleurs.bleuClair,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: espacements.s3,
  },
  lienOubli: { alignSelf: "flex-end", minHeight: 30, justifyContent: "center", marginTop: -6, marginBottom: espacements.s2 },
  lienOubliTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 13 },
  lienDiscret: { alignItems: "center", marginTop: 10, minHeight: 28, justifyContent: "center" },
  lienDiscretTexte: { color: "#5B6B8C", fontSize: 12.5, textDecorationLine: "underline" },
  boutonRetour: { marginTop: espacements.s1, alignItems: "center", justifyContent: "center", height: 36 },
  boutonRetourTexte: { color: couleurs.encreAttenuee, fontWeight: "600" },
});
