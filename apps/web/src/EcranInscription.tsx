import * as React from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, Globe, Lock, MapPin, User } from "lucide-react";
import type { InscriptionHotelPayload } from "@hotel-chicago/types";
import { ChampTelephone, telephoneDepuisSaisie } from "@hotel-chicago/ui";
import { MiseEnPageAuth, Etapes } from "./auth/MiseEnPageAuth";
import { ChampAuth } from "./auth/ChampAuth";

export interface EcranInscriptionProps {
  erreur: string | null;
  enCours: boolean;
  /** `payerMaintenant` : le patron veut régler son abonnement tout de suite (sans passer par l'essai) — l'écran de succès l'envoie vers le paiement. */
  onSoumettre: (dto: InscriptionHotelPayload, payerMaintenant: boolean) => void;
}

const REGEX_SOUS_DOMAINE = /^[a-z0-9-]+$/;

/** « Hôtel Le Grand Bleu » → « hotel-le-grand-bleu » (proposition initiale). */
function proposerSousDomaine(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Même structure en 2 étapes et même validation que l'assistant mobile
 * (apps/mobile/src/ecrans/EcranInscription.tsx), même appel inscrireHotel.
 * Pas d'étape logo (voir DECISIONS.md, Phases 4-8). */
export function EcranInscription({ erreur, enCours, onSoumettre }: EcranInscriptionProps) {
  const [etape, setEtape] = useState<1 | 2>(1);

  const [nom, setNom] = useState("");
  const [sousDomaine, setSousDomaine] = useState("");
  const [sousDomaineModifie, setSousDomaineModifie] = useState(false);
  const [adresse, setAdresse] = useState("");

  const [nomProprietaire, setNomProprietaire] = useState("");
  const [telephoneProprietaire, setTelephoneProprietaire] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmationMotDePasse, setConfirmationMotDePasse] = useState("");
  const [payerMaintenant, setPayerMaintenant] = useState(false);
  const [erreurLocale, setErreurLocale] = useState<string | null>(null);

  function changerNom(valeur: string) {
    setNom(valeur);
    // Tant que l'utilisateur n'a pas touché au sous-domaine, il suit le nom.
    if (!sousDomaineModifie) setSousDomaine(proposerSousDomaine(valeur));
  }

  function validerEtape1(): string | null {
    if (!nom.trim()) return "Le nom de l'hôtel est obligatoire.";
    if (!REGEX_SOUS_DOMAINE.test(sousDomaine)) {
      return "Le sous-domaine ne doit contenir que des minuscules, chiffres et tirets (ex. hotel-chicago).";
    }
    return null;
  }

  function passerEtape2(e: React.FormEvent) {
    e.preventDefault();
    const erreurValidation = validerEtape1();
    setErreurLocale(erreurValidation);
    if (!erreurValidation) setEtape(2);
  }

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
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
    }, payerMaintenant);
  }

  const erreurAffichee = erreurLocale ?? erreur;

  return (
    <MiseEnPageAuth>
      <div className="carte-auth">
        <img className="carte-auth__logo" src="/logo-hotelsaver.png" alt="" />
        <div className="carte-auth__marque">HotelSaver</div>
        <Etapes etape={etape} />
        <h1 className="carte-auth__titre">Créez votre hôtel</h1>
        <p className="carte-auth__sous-titre">
          {etape === 1
            ? "Quelques informations suffisent pour commencer et profiter de tous nos outils."
            : "Dernière étape : votre compte. Ce numéro servira à vous connecter et à joindre votre hôtel (modifiable ensuite dans Site de l'hôtel)."}
        </p>

        {etape === 1 && (
          <form onSubmit={passerEtape2} noValidate>
            <ChampAuth id="nom" libelle="Nom de l'hôtel *" icone={Building2} valeur={nom} onChange={changerNom} valide={nom.trim().length > 1} placeholder="Ex. Hôtel Le Grand Bleu" autoComplete="organization" />
            <ChampAuth
              id="sous-domaine"
              libelle="Sous-domaine *"
              icone={Globe}
              valeur={sousDomaine}
              onChange={(v) => {
                setSousDomaineModifie(true);
                setSousDomaine(v.toLowerCase());
              }}
              valide={REGEX_SOUS_DOMAINE.test(sousDomaine)}
              suffixe=".hotelsaver.com"
              placeholder="hotel-mon-etablissement"
              autoCapitalize="none"
              spellCheck={false}
            />
            <ChampAuth id="adresse" libelle="Adresse (optionnelle)" icone={MapPin} valeur={adresse} onChange={setAdresse} placeholder="Ex. Avenue de la Paix, Goma" autoComplete="street-address" />

            {erreurAffichee && (
              <p className="auth-erreur" role="alert">
                {erreurAffichee}
              </p>
            )}

            <button type="submit" className="bouton-auth">
              Continuer <ArrowRight size={18} aria-hidden="true" />
            </button>
          </form>
        )}

        {etape === 2 && (
          <form onSubmit={soumettre} noValidate>
            <ChampAuth id="nom-proprietaire" libelle="Votre nom *" icone={User} valeur={nomProprietaire} onChange={setNomProprietaire} valide={nomProprietaire.trim().length > 1} placeholder="Ex. Jean Mukendi" autoComplete="name" />
            <div className="champ-auth">
              <label htmlFor="telephone-proprietaire">Numéro de téléphone * (pour vous connecter)</label>
              <ChampTelephone id="telephone-proprietaire" value={telephoneProprietaire} onChange={setTelephoneProprietaire} required />
            </div>
            <ChampAuth id="mot-de-passe" libelle="Mot de passe *" icone={Lock} valeur={motDePasse} onChange={setMotDePasse} type="password" placeholder="Minimum 8 caractères" autoComplete="new-password" />
            <ChampAuth id="confirmation" libelle="Confirmer le mot de passe *" icone={Lock} valeur={confirmationMotDePasse} onChange={setConfirmationMotDePasse} type="password" autoComplete="new-password" />

            <fieldset className="demarrage">
              <legend>Comment voulez-vous commencer ?</legend>
              <label className={`demarrage__choix${!payerMaintenant ? " demarrage__choix--actif" : ""}`}>
                <input type="radio" name="demarrage" checked={!payerMaintenant} onChange={() => setPayerMaintenant(false)} />
                <span>
                  <strong>Essai gratuit</strong>
                  <small>Testez toutes les fonctions sans payer. Vous choisirez votre formule plus tard.</small>
                </span>
              </label>
              <label className={`demarrage__choix${payerMaintenant ? " demarrage__choix--actif" : ""}`}>
                <input type="radio" name="demarrage" checked={payerMaintenant} onChange={() => setPayerMaintenant(true)} />
                <span>
                  <strong>Payer mon abonnement maintenant</strong>
                  <small>Pour ne plus y penser. Vos jours d'essai ne sont pas perdus : ils s'ajoutent à votre abonnement.</small>
                </span>
              </label>
            </fieldset>

            {erreurAffichee && (
              <p className="auth-erreur" role="alert">
                {erreurAffichee}
              </p>
            )}

            <button type="submit" className="bouton-auth" disabled={enCours}>
              {enCours ? "Création…" : "Créer mon compte"}
            </button>
            <button
              type="button"
              className="lien-auth"
              onClick={() => {
                setErreurLocale(null);
                setEtape(1);
              }}
            >
              <ArrowLeft size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
              Retour
            </button>
          </form>
        )}

        <Link to="/connexion" className="lien-auth">
          Avez-vous déjà un compte ? <strong>Se connecter</strong>
        </Link>
      </div>
    </MiseEnPageAuth>
  );
}
