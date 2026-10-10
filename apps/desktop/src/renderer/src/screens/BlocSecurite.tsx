import * as React from "react";
import { useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Button } from "@hotel-chicago/ui";
import { KeyRound, Lock, Timer } from "lucide-react";

export interface PreferencesSecurite {
  verrouLancement: boolean;
  inactiviteMinutes: number | null;
}

export interface BlocSecuriteProps {
  client: ClientApi;
  preferences: PreferencesSecurite;
  onChangerPreferences: (p: Partial<PreferencesSecurite>) => Promise<void>;
}

const DELAIS = [5, 10, 15, 30, 60];

/**
 * Sécurité du compte sur ce poste. Rien n'est imposé en plus de ce qui existe déjà : le verrou après inactivité est DÉSACTIVÉ tant
 * que l'utilisateur ne le choisit pas (les équipes qui travaillent vite n'aiment pas être interrompues), et le mot de passe au
 * lancement (par défaut pour le patron, qui voit les finances) peut être retiré.
 */
export function BlocSecurite({ client, preferences, onChangerPreferences }: BlocSecuriteProps) {
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  async function changer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    if (nouveau.length < 8) return setErreur("Le nouveau mot de passe doit contenir au moins 8 caractères.");
    if (nouveau !== confirmation) return setErreur("Les deux saisies du nouveau mot de passe ne sont pas identiques.");
    setEnCours(true);
    try {
      await client.changerMotDePasse(actuel, nouveau);
      setActuel("");
      setNouveau("");
      setConfirmation("");
      setSucces("Mot de passe changé. Vos autres appareils devront se reconnecter.");
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Changement impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="carte-formulaire">
      <p className="hc-text-label texte-discret">Sécurité</p>

      <div className="parametres-ligne">
        <span className="parametres-ligne__icone">
          <Lock size={18} aria-hidden="true" />
        </span>
        <span className="hc-text-body">
          {preferences.verrouLancement ? "Mot de passe demandé à chaque lancement" : "Pas de mot de passe au lancement"}
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={() => void onChangerPreferences({ verrouLancement: !preferences.verrouLancement })}>
          {preferences.verrouLancement ? "Désactiver" : "Activer"}
        </Button>
      </div>

      <div className="parametres-ligne">
        <span className="parametres-ligne__icone">
          <Timer size={18} aria-hidden="true" />
        </span>
        <label className="hc-text-body" htmlFor="verrou-inactivite">
          Verrouiller après inactivité
        </label>
        <select
          id="verrou-inactivite"
          value={preferences.inactiviteMinutes ?? ""}
          onChange={(e) => void onChangerPreferences({ inactiviteMinutes: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Jamais (par défaut)</option>
          {DELAIS.map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </div>
      <p className="hc-text-caption texte-discret">
        Le verrou ne perd aucune donnée : vos actions non envoyées restent sur l'ordinateur ; il suffit de retaper le mot de passe.
      </p>

      <form onSubmit={changer} className="formulaire" aria-label="Changer mon mot de passe">
        <p className="hc-text-body">
          <KeyRound size={16} aria-hidden="true" /> Changer mon mot de passe
        </p>
        <label className="hc-text-label" htmlFor="mdp-actuel">
          Mot de passe actuel
        </label>
        <input id="mdp-actuel" type="password" autoComplete="current-password" value={actuel} onChange={(e) => setActuel(e.target.value)} />
        <label className="hc-text-label" htmlFor="mdp-nouveau">
          Nouveau mot de passe (8 caractères minimum)
        </label>
        <input id="mdp-nouveau" type="password" autoComplete="new-password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} />
        <label className="hc-text-label" htmlFor="mdp-confirmation">
          Confirmer le nouveau mot de passe
        </label>
        <input id="mdp-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        {erreur && (
          <p role="alert" className="hc-text-body texte-erreur">
            {erreur}
          </p>
        )}
        {succes && (
          <p role="status" className="hc-text-body">
            {succes}
          </p>
        )}
        <Button type="submit" disabled={enCours || !actuel || !nouveau}>
          {enCours ? "…" : "Changer le mot de passe"}
        </Button>
      </form>
    </div>
  );
}
