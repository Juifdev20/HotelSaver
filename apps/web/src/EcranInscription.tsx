import * as React from "react";
import { useState } from "react";
import { Button } from "@hotel-chicago/ui";
import type { InscriptionHotelPayload } from "@hotel-chicago/types";

export interface EcranInscriptionProps {
  erreur: string | null;
  enCours: boolean;
  onSoumettre: (dto: InscriptionHotelPayload) => void;
}

const REGEX_SOUS_DOMAINE = /^[a-z0-9-]+$/;

/** Même structure en 2 étapes que apps/mobile/src/ecrans/EcranInscription.tsx
 * (même validation locale, même appel inscrireHotel), portée en DOM/React au
 * lieu de React Native. Pas d'étape logo (voir DECISIONS.md, Phases 4-8). */
export function EcranInscription({ erreur, enCours, onSoumettre }: EcranInscriptionProps) {
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

  function passerEtape2(e: React.FormEvent) {
    e.preventDefault();
    const erreurValidation = validerEtape1();
    setErreurLocale(erreurValidation);
    if (!erreurValidation) setEtape(2);
  }

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
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
    <div className="page-centree">
      <div className="carte carte--etroite">
        <h1 className="titre">HotelSaver</h1>
        <p className="sous-titre">{etape === 1 ? "Étape 1 sur 2 — Votre hôtel" : "Étape 2 sur 2 — Votre compte"}</p>

        {etape === 1 && (
          <form onSubmit={passerEtape2}>
            <label className="label" htmlFor="nom">
              Nom de l'hôtel
            </label>
            <input id="nom" className="champ" value={nom} onChange={(e) => setNom(e.target.value)} />

            <label className="label" htmlFor="sous-domaine">
              Sous-domaine
            </label>
            <input
              id="sous-domaine"
              className="champ"
              value={sousDomaine}
              onChange={(e) => setSousDomaine(e.target.value.toLowerCase())}
              placeholder="hotel-chicago"
            />

            <label className="label" htmlFor="telephone">
              Téléphone (optionnel)
            </label>
            <input id="telephone" className="champ" value={telephoneContact} onChange={(e) => setTelephoneContact(e.target.value)} />

            <label className="label" htmlFor="adresse">
              Adresse (optionnelle)
            </label>
            <input id="adresse" className="champ" value={adresse} onChange={(e) => setAdresse(e.target.value)} />

            {erreurAffichee && (
              <p className="erreur" role="alert">
                {erreurAffichee}
              </p>
            )}

            <Button type="submit" style={{ marginTop: 16, width: "100%" }}>
              Continuer
            </Button>
          </form>
        )}

        {etape === 2 && (
          <form onSubmit={soumettre}>
            <label className="label" htmlFor="nom-proprietaire">
              Votre nom
            </label>
            <input id="nom-proprietaire" className="champ" value={nomProprietaire} onChange={(e) => setNomProprietaire(e.target.value)} />

            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="champ"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label className="label" htmlFor="mot-de-passe">
              Mot de passe
            </label>
            <input
              id="mot-de-passe"
              className="champ"
              type="password"
              autoComplete="new-password"
              placeholder="8 caractères minimum"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />

            <label className="label" htmlFor="confirmation-mot-de-passe">
              Confirmer le mot de passe
            </label>
            <input
              id="confirmation-mot-de-passe"
              className="champ"
              type="password"
              autoComplete="new-password"
              value={confirmationMotDePasse}
              onChange={(e) => setConfirmationMotDePasse(e.target.value)}
            />

            {erreurAffichee && (
              <p className="erreur" role="alert">
                {erreurAffichee}
              </p>
            )}

            <Button type="submit" disabled={enCours} style={{ marginTop: 16, width: "100%" }}>
              {enCours ? "Création…" : "Créer mon compte"}
            </Button>

            <button type="button" className="lien-retour" onClick={() => setEtape(1)}>
              Retour
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
