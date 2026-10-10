import * as React from "react";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, Eye, EyeOff, Globe, Lock, Mail, MapPin, Phone, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTitrePage } from "@hotel-chicago/ui";
import type { InscriptionHotelPayload } from "@hotel-chicago/types";
import { MiseEnPageAuth } from "../components/MiseEnPageAuth";
import logo from "../../../../../../assets/icons/hotelsaver-icone.png";

export interface EcranInscriptionProps {
  erreur: string | null;
  enCours: boolean;
  onSoumettre: (dto: InscriptionHotelPayload) => void;
  /** Retour à la connexion (« Avez-vous déjà un compte ? Se connecter »). */
  onRetourConnexion: () => void;
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

interface ChampProps {
  id: string;
  libelle: string;
  icone: LucideIcon;
  valeur: string;
  onChange: (valeur: string) => void;
  valide?: boolean;
  suffixe?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}

/** Champ à icône, coche de validation et œil pour un mot de passe — même style que la connexion. */
function Champ({ id, libelle, icone: Icone, valeur, onChange, valide, suffixe, type = "text", placeholder, autoComplete }: ChampProps) {
  const [visible, setVisible] = useState(false);
  const estMotDePasse = type === "password";
  return (
    <>
      <label className="hc-auth__label" htmlFor={id}>
        {libelle}
      </label>
      <div className="hc-auth__boite">
        <Icone size={18} aria-hidden="true" />
        <input
          id={id}
          type={estMotDePasse && visible ? "text" : type}
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        {suffixe && <span className="hc-auth__suffixe">{suffixe}</span>}
        {valide && !estMotDePasse && (
          <span className="hc-auth__ok" aria-label="Valide">
            <Check size={12} aria-hidden="true" />
          </span>
        )}
        {estMotDePasse && (
          <button
            type="button"
            className="hc-auth__oeil"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Masquer la saisie" : "Afficher la saisie"}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </>
  );
}

/** Même parcours en 2 étapes et même validation que l'inscription mobile
 * (apps/mobile/src/ecrans/EcranInscription.tsx) et web : un utilisateur de
 * l'application s'inscrit DANS l'application, jamais sur le site. */
export function EcranInscription({ erreur, enCours, onSoumettre, onRetourConnexion }: EcranInscriptionProps) {
  const [etape, setEtape] = useState<1 | 2>(1);
  useTitrePage("Créer le compte de mon hôtel");

  const [nom, setNom] = useState("");
  const [sousDomaine, setSousDomaine] = useState("");
  const [sousDomaineModifie, setSousDomaineModifie] = useState(false);
  const [telephoneContact, setTelephoneContact] = useState("");
  const [adresse, setAdresse] = useState("");

  const [nomProprietaire, setNomProprietaire] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreurLocale, setErreurLocale] = useState<string | null>(null);

  function changerNom(valeur: string) {
    setNom(valeur);
    // Tant que le sous-domaine n'a pas été touché, il suit le nom de l'hôtel.
    if (!sousDomaineModifie) setSousDomaine(proposerSousDomaine(valeur));
  }

  function passerEtape2(e: React.FormEvent) {
    e.preventDefault();
    let problème: string | null = null;
    if (!nom.trim()) problème = "Le nom de l'hôtel est obligatoire.";
    else if (!REGEX_SOUS_DOMAINE.test(sousDomaine)) {
      problème = "Le sous-domaine ne doit contenir que des minuscules, chiffres et tirets (ex. hotel-chicago).";
    }
    setErreurLocale(problème);
    if (!problème) setEtape(2);
  }

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!nomProprietaire.trim()) return setErreurLocale("Votre nom est obligatoire.");
    if (!email.trim()) return setErreurLocale("L'email est obligatoire.");
    if (motDePasse.length < 8) return setErreurLocale("Le mot de passe doit contenir au moins 8 caractères.");
    if (motDePasse !== confirmation) return setErreurLocale("Les deux mots de passe ne correspondent pas.");
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
    <MiseEnPageAuth>
      <div className="hc-auth__conteneur">
        <div className="hc-auth__carte">
          <img className="hc-auth__logo" src={logo} alt="" />
          <h1 className="hc-auth__marque">HotelSaver</h1>

          <ol className="hc-auth__etapes" aria-label={`Étape ${etape} sur 2`}>
            <li className="hc-auth__etape hc-auth__etape--actif">
              <span>{etape > 1 ? <Check size={16} aria-hidden="true" /> : 1}</span>
              Votre hôtel
            </li>
            <li className="hc-auth__etapes-trait" aria-hidden="true" />
            <li className={`hc-auth__etape ${etape === 2 ? "hc-auth__etape--actif" : ""}`}>
              <span>2</span>
              Vos coordonnées
            </li>
          </ol>

          <h2 className="hc-auth__titre">Créez votre hôtel</h2>
          <p className="hc-auth__sous-titre">
            {etape === 1
              ? "Quelques informations suffisent pour commencer."
              : "Dernière étape : le compte du patron, qui gérera les accès de l'équipe."}
          </p>

          {etape === 1 && (
            <form onSubmit={passerEtape2} noValidate>
              <Champ id="ins-nom" libelle="Nom de l'hôtel *" icone={Building2} valeur={nom} onChange={changerNom} valide={nom.trim().length > 1} placeholder="Ex. Hôtel Le Grand Bleu" autoComplete="organization" />
              <Champ
                id="ins-sous-domaine"
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
              />
              <Champ id="ins-telephone" libelle="Téléphone (optionnel)" icone={Phone} valeur={telephoneContact} onChange={setTelephoneContact} type="tel" placeholder="Ex. +243 970 000 000" autoComplete="tel" />
              <Champ id="ins-adresse" libelle="Adresse (optionnelle)" icone={MapPin} valeur={adresse} onChange={setAdresse} placeholder="Ex. Avenue de la Paix, Goma" autoComplete="street-address" />

              {erreurAffichee && (
                <p className="hc-auth__erreur" role="alert">
                  {erreurAffichee}
                </p>
              )}
              <button type="submit" className="hc-auth__bouton">
                Continuer <ArrowRight size={18} aria-hidden="true" />
              </button>
            </form>
          )}

          {etape === 2 && (
            <form onSubmit={soumettre} noValidate>
              <Champ id="ins-proprietaire" libelle="Votre nom *" icone={User} valeur={nomProprietaire} onChange={setNomProprietaire} valide={nomProprietaire.trim().length > 1} placeholder="Ex. Jean Mukendi" autoComplete="name" />
              <Champ id="ins-email" libelle="Adresse e-mail *" icone={Mail} valeur={email} onChange={setEmail} valide={/^\S+@\S+\.\S+$/.test(email)} type="email" placeholder="ex. hotel@monetablissement.com" autoComplete="username" />
              <Champ id="ins-mot-de-passe" libelle="Mot de passe *" icone={Lock} valeur={motDePasse} onChange={setMotDePasse} type="password" placeholder="Minimum 8 caractères" autoComplete="new-password" />
              <Champ id="ins-confirmation" libelle="Confirmer le mot de passe *" icone={Lock} valeur={confirmation} onChange={setConfirmation} type="password" autoComplete="new-password" />

              {erreurAffichee && (
                <p className="hc-auth__erreur" role="alert">
                  {erreurAffichee}
                </p>
              )}
              <button type="submit" className="hc-auth__bouton" disabled={enCours}>
                {enCours ? "Création…" : "Créer mon compte"}
              </button>
              <button
                type="button"
                className="hc-auth__retour"
                onClick={() => {
                  setErreurLocale(null);
                  setEtape(1);
                }}
              >
                <ArrowLeft size={14} aria-hidden="true" /> Retour
              </button>
            </form>
          )}

          <p className="hc-auth__pas-de-compte">
            Avez-vous déjà un compte ?{" "}
            <button type="button" onClick={onRetourConnexion}>
              Se connecter
            </button>
          </p>
        </div>
      </div>
    </MiseEnPageAuth>
  );
}
