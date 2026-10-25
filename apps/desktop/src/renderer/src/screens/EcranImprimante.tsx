import * as React from "react";
import { useState } from "react";
import { Button } from "@hotel-chicago/ui";
import type { ConfigurationApp } from "../../../main/config-store";

export interface EcranImprimanteProps {
  interfaceImprimante: string | null;
  onEnregistrer: (partielle: Partial<ConfigurationApp>) => void;
  onRetour: () => void;
}

/**
 * Connexion à l'imprimante ESC/POS (section 11, reçu chambre uniquement côté
 * desktop — voir le plan). Pas de liste des imprimantes système Windows :
 * `node-thermal-printer` ne peut leur envoyer des octets bruts qu'via le
 * paquet natif `printer`, un risque de build évité ici (voir `main/imprimante.ts`).
 * Le patron renseigne directement une connexion réseau ou un port.
 */
export function EcranImprimante({ interfaceImprimante, onEnregistrer, onRetour }: EcranImprimanteProps) {
  const [valeur, setValeur] = useState(interfaceImprimante ?? "");
  const [enregistre, setEnregistre] = useState(false);
  const [enTest, setEnTest] = useState(false);
  const [messageTest, setMessageTest] = useState<string | null>(null);

  async function tester() {
    setEnTest(true);
    setMessageTest(null);
    try {
      await window.hotelChicago.imprimerTicketDeTest(valeur.trim());
      setMessageTest("Ticket de test envoyé.");
    } catch (e) {
      setMessageTest(e instanceof Error ? e.message : "Échec de l'impression.");
    } finally {
      setEnTest(false);
    }
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Imprimante</h1>
          <p className="hc-text-body page__sous-titre">Connexion à l'imprimante ESC/POS pour le reçu chambre.</p>
        </div>
        <Button type="button" variant="secondary" onClick={onRetour}>
          Retour
        </Button>
      </header>

      <div className="page__colonnes">
      <div className="carte-formulaire formulaire">
        <label className="hc-text-label" htmlFor="champ-interface-imprimante">
          Connexion
        </label>
        <input
          id="champ-interface-imprimante"
          type="text"
          value={valeur}
          onChange={(e) => {
            setValeur(e.target.value);
            setEnregistre(false);
          }}
          placeholder="tcp://192.168.1.50:9100"
        />
        <p className="hc-text-caption texte-discret">Saisissez l'adresse de l'imprimante, enregistrez, puis imprimez un ticket de test pour vérifier.</p>

        {messageTest && (
          <p className="hc-text-body" role="status">
            {messageTest}
          </p>
        )}
        {enregistre && (
          <p className="hc-text-body" role="status">
            Enregistré.
          </p>
        )}

        <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
          <Button
            type="button"
            onClick={() => {
              onEnregistrer({ imprimanteInterface: valeur.trim() || null });
              setEnregistre(true);
            }}
          >
            Enregistrer
          </Button>
          <Button type="button" variant="secondary" onClick={tester} disabled={!valeur.trim() || enTest}>
            {enTest ? "…" : "Imprimer un ticket de test"}
          </Button>
        </div>
      </div>

      <aside className="carte-formulaire" aria-label="Exemples d'adresse">
        <p className="hc-text-body-strong">Quelle adresse saisir ?</p>
        <dl className="aide-adresses">
          <dt className="hc-text-label texte-discret">Imprimante réseau</dt>
          <dd className="hc-text-body">
            <code>tcp://192.168.1.50:9100</code>
            <span className="hc-text-caption texte-discret">Adresse IP de l'imprimante et port 9100, le plus courant sur les imprimantes ESC/POS.</span>
          </dd>
          <dt className="hc-text-label texte-discret">Imprimante USB ou série (Windows)</dt>
          <dd className="hc-text-body">
            <code>\\.\COM5</code>
            <span className="hc-text-caption texte-discret">Le numéro du port COM figure dans le Gestionnaire de périphériques.</span>
          </dd>
          <dt className="hc-text-label texte-discret">Imprimante USB (Linux)</dt>
          <dd className="hc-text-body">
            <code>/dev/usb/lp0</code>
          </dd>
        </dl>
      </aside>
      </div>
    </div>
  );
}
