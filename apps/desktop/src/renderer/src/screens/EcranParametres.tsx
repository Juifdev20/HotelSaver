import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import type { ClientApi, TauxChange } from "@hotel-chicago/api-client";
import { Devise, Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { Button, formatMontant } from "@hotel-chicago/ui";
import { Coins, Moon, Printer, Sun, Users } from "lucide-react";
import type { ConfigurationApp } from "../../../main/config-store";
import type { IdPage } from "../navigation";
import { IndicateurConnexion } from "../layout/IndicateurConnexion";

export interface EcranParametresProps {
  configuration: ConfigurationApp;
  onEnregistrer: (partielle: Partial<ConfigurationApp>) => void;
  /** Absent quand l'écran est affiché dans la coquille (la navigation latérale sert de retour). */
  onRetour?: () => void;
  /** Présent seulement une fois connecté : l'écran de connexion n'a pas encore de jeton pour appeler l'API. */
  client?: ClientApi;
  /** Présent seulement une fois connecté — conditionne le bloc Administration (PATRON uniquement). */
  utilisateur?: UtilisateurAuthentifie;
  /** Présent seulement une fois connecté — conditionne le bloc Impression (rien à imprimer avant l'écran de connexion). */
  onNaviguer?: (page: IdPage) => void;
  /** Mode sombre : plus de bouton dédié dans la barre du haut en fenêtre étroite
   * (maquette mobile du 25/09/2026), donc toujours accessible ici. */
  themeSombre: boolean;
  onBasculerTheme: () => void;
}

/** Taux de change USD/CDF (PATRON, section 9.4) : taux en vigueur, saisie
 * du nouveau taux du jour, historique (50 dernières lignes). */
function GestionTauxChange({ client }: { client: ClientApi }) {
  const [historique, setHistorique] = useState<TauxChange[] | null>(null);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const recharger = useCallback(() => {
    client
      .listerTauxChange()
      .then(setHistorique)
      .catch((e: Error) => setErreur(e.message));
  }, [client]);

  useEffect(recharger, [recharger]);

  const actuel = historique?.[0] ?? null;

  async function enregistrer() {
    const valeur = Number(saisie.replace(/\s/g, "").replace(",", "."));
    if (!saisie.trim() || Number.isNaN(valeur) || valeur <= 0) {
      setErreur("Saisissez un taux positif (ex. 2800 pour 1 $ = 2 800 FC).");
      return;
    }
    setEnCours(true);
    setErreur(null);
    setConfirmation(null);
    try {
      await client.creerTauxChange(valeur);
      setSaisie("");
      setConfirmation(`Taux enregistré : 1 $ = ${formatMontant(valeur, Devise.CDF)}`);
      recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <>
      <div className="parametres-ligne">
        <span className="parametres-ligne__icone">
          <Coins size={18} aria-hidden="true" />
        </span>
        <span className="hc-text-body">
          Taux de change : {actuel ? `1 $ = ${formatMontant(actuel.cdfParUsd, Devise.CDF)}` : historique ? "aucun taux défini" : "…"}
        </span>
      </div>
      <div className="parametres-ligne" style={{ alignItems: "center" }}>
        <input
          type="text"
          inputMode="decimal"
          placeholder="Nouveau taux, ex. 2800"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          aria-label="Nouveau taux USD/CDF"
          style={{ maxWidth: 220 }}
        />
        <Button type="button" variant="secondary" size="sm" onClick={enregistrer} disabled={enCours}>
          {enCours ? "…" : "Enregistrer"}
        </Button>
      </div>
      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}
      {confirmation && (
        <p className="hc-text-body texte-succes" role="status">
          {confirmation}
        </p>
      )}
      {historique && historique.length > 1 && (
        <p className="hc-text-caption texte-discret">
          Historique :{" "}
          {historique
            .slice(1, 6)
            .map((t) => `${new Date(t.createdAt).toLocaleDateString("fr-FR")} → ${formatMontant(t.cdfParUsd, Devise.CDF)}`)
            .join(" · ")}
        </p>
      )}
    </>
  );
}

/**
 * Section 6 : "les apps mobile et desktop stockent l'URL de l'API dans une
 * configuration modifiable depuis un écran Paramètres, pas un .env, pour
 * pouvoir être reconfigurées sans recompiler."
 */
export function EcranParametres({
  configuration,
  onEnregistrer,
  onRetour,
  client,
  utilisateur,
  onNaviguer,
  themeSombre,
  onBasculerTheme,
}: EcranParametresProps) {
  const [apiUrl, setApiUrl] = useState(configuration.apiUrl);
  const [enregistre, setEnregistre] = useState(false);

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Paramètres</h1>
          <p className="hc-text-body page__sous-titre">Configuration de ce poste.</p>
        </div>
      </header>

      <div className="carte-formulaire formulaire">
        <label className="hc-text-label" htmlFor="champ-api-url">
          URL de l'API
        </label>
        <input
          id="champ-api-url"
          type="url"
          value={apiUrl}
          onChange={(e) => {
            setApiUrl(e.target.value);
            setEnregistre(false);
          }}
        />
        <p className="hc-text-caption texte-discret">Adresse du serveur de l'hôtel, par exemple http://localhost:3001.</p>

        {client && (
          <div>
            <p className="hc-text-label texte-discret">État du serveur</p>
            <IndicateurConnexion client={client} />
          </div>
        )}

        {enregistre && (
          <p className="hc-text-body" role="status">
            Paramètres enregistrés.
          </p>
        )}

        <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
          <Button
            type="button"
            onClick={() => {
              onEnregistrer({ apiUrl });
              if (onRetour) onRetour();
              else setEnregistre(true);
            }}
          >
            Enregistrer
          </Button>
          {onRetour && (
            <Button type="button" variant="secondary" onClick={onRetour}>
              Retour
            </Button>
          )}
        </div>
      </div>

      <div className="carte-formulaire">
        <p className="hc-text-label texte-discret">Apparence</p>
        <div className="parametres-ligne">
          <span className="parametres-ligne__icone">
            {themeSombre ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </span>
          <span className="hc-text-body">{themeSombre ? "Mode sombre" : "Mode clair"}</span>
          <Button type="button" variant="secondary" size="sm" onClick={onBasculerTheme}>
            Basculer
          </Button>
        </div>
      </div>

      {onNaviguer && (
        <div className="carte-formulaire">
          <p className="hc-text-label texte-discret">Impression</p>
          <div className="parametres-ligne">
            <span className="parametres-ligne__icone">
              <Printer size={18} aria-hidden="true" />
            </span>
            <span className="hc-text-body">Imprimante (reçu chambre)</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => onNaviguer("imprimante")}>
              Configurer
            </Button>
          </div>
        </div>
      )}

      {/* Utilisateurs et Taux de change vivent ici plutôt que dans la barre
          latérale, pour la garder courte (demande du client du 25/09/2026) —
          PATRON uniquement, comme dans la matrice 9.3. */}
      {utilisateur?.role === Role.PATRON && (
        <div className="carte-formulaire">
          <p className="hc-text-label texte-discret">Administration</p>
          <div className="parametres-ligne">
            <span className="parametres-ligne__icone">
              <Users size={18} aria-hidden="true" />
            </span>
            <span className="hc-text-body">Utilisateurs</span>
            {onNaviguer && (
              <Button type="button" variant="secondary" size="sm" onClick={() => onNaviguer("utilisateurs")}>
                Gérer
              </Button>
            )}
          </div>
          {client ? (
            <GestionTauxChange client={client} />
          ) : (
            <div className="parametres-ligne">
              <span className="parametres-ligne__icone">
                <Coins size={18} aria-hidden="true" />
              </span>
              <span className="hc-text-body">Taux de change</span>
              <span className="hc-text-caption texte-discret">disponible une fois connecté</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
