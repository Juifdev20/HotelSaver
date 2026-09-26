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
        <p className="hc-text-caption texte-discret">
          Imprimante réseau : tcp://ip:port (port 9100 le plus courant sur les imprimantes ESC/POS bon marché).
          Imprimante USB/série : \\.\COM5 sous Windows, /dev/usb/lp0 sous Linux.
        </p>

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
    </div>
  );
}
