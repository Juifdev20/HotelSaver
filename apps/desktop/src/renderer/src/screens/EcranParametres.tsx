import * as React from "react";
import { useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Button } from "@hotel-chicago/ui";
import type { ConfigurationApp } from "../../../main/config-store";
import { IndicateurConnexion } from "../layout/IndicateurConnexion";

export interface EcranParametresProps {
  configuration: ConfigurationApp;
  onEnregistrer: (partielle: Partial<ConfigurationApp>) => void;
  /** Absent quand l'écran est affiché dans la coquille (la navigation latérale sert de retour). */
  onRetour?: () => void;
  /** Présent seulement une fois connecté : l'écran de connexion n'a pas encore de jeton pour appeler l'API. */
  client?: ClientApi;
}

/**
 * Section 6 : "les apps mobile et desktop stockent l'URL de l'API dans une
 * configuration modifiable depuis un écran Paramètres, pas un .env, pour
 * pouvoir être reconfigurées sans recompiler."
 */
export function EcranParametres({ configuration, onEnregistrer, onRetour, client }: EcranParametresProps) {
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
    </div>
  );
}
