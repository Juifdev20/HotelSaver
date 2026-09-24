import * as React from "react";
import { useState } from "react";
import { Button } from "@hotel-chicago/ui";
import type { ConfigurationApp } from "../../../main/config-store";

export interface EcranParametresProps {
  configuration: ConfigurationApp;
  onEnregistrer: (partielle: Partial<ConfigurationApp>) => void;
  onRetour: () => void;
}

/**
 * Section 6 : "les apps mobile et desktop stockent l'URL de l'API dans une
 * configuration modifiable depuis un écran Paramètres, pas un .env, pour
 * pouvoir être reconfigurées sans recompiler."
 */
export function EcranParametres({ configuration, onEnregistrer, onRetour }: EcranParametresProps) {
  const [apiUrl, setApiUrl] = useState(configuration.apiUrl);

  return (
    <div className="hc-ecran-connexion">
      <h1 className="hc-text-heading">Paramètres</h1>

      <label className="hc-text-label" htmlFor="champ-api-url">
        URL de l'API
      </label>
      <input id="champ-api-url" type="url" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />

      <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
        <Button
          type="button"
          onClick={() => {
            onEnregistrer({ apiUrl });
            onRetour();
          }}
        >
          Enregistrer
        </Button>
        <Button type="button" variant="secondary" onClick={onRetour}>
          Retour
        </Button>
      </div>
    </div>
  );
}
