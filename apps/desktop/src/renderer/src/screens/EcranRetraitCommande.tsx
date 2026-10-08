import * as React from "react";
import { useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Button } from "@hotel-chicago/ui";
import { Ticket } from "lucide-react";

export interface EcranRetraitCommandeProps {
  client: ClientApi;
  /** Ouvre le détail du compte trouvé (lignes, encaissement, servir). */
  onOuvrirCompte: (compteId: string) => void;
}

/**
 * Le client présente la référence de sa commande web (ticket PDF / écran de
 * confirmation). La recherche ne trouve que les commandes encore OUVERTES :
 * une fois le compte encaissé et clôturé, la référence devient obsolète —
 * elle ne peut pas être réutilisée pour se faire servir une deuxième fois.
 */
export function EcranRetraitCommande({ client, onOuvrirCompte }: EcranRetraitCommandeProps) {
  const [reference, setReference] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function rechercher() {
    if (!reference.trim() || chargement) return;
    setChargement(true);
    setErreur(null);
    try {
      const compte = await client.trouverCompteParReference(reference);
      onOuvrirCompte(compte.id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Recherche impossible pour le moment.");
    } finally {
      setChargement(false);
    }
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">
            <Ticket size={24} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: "var(--hc-space-2)" }} />
            Retrait commande
          </h1>
          <p className="hc-text-body page__sous-titre">Commande passée sur le site web de l'hôtel</p>
        </div>
      </header>

      <div className="carte-tableau" style={{ maxWidth: 480, padding: "var(--hc-space-4)" }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void rechercher();
          }}
        >
          <label className="hc-text-label" htmlFor="champ-reference">
            Référence du ticket
          </label>
          <p className="hc-text-caption texte-discret" style={{ marginTop: 4 }}>
            Le client présente la référence affichée sur son ticket (ex. E6A5E231). Tapez-la pour ouvrir sa commande,
            l'encaisser et la marquer servie.
          </p>
          <div style={{ display: "flex", gap: "var(--hc-space-2)", marginTop: "var(--hc-space-3)" }}>
            <input
              id="champ-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex. E6A5E231"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              style={{ flex: 1, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}
              autoFocus
            />
            <Button type="submit" disabled={!reference.trim() || chargement}>
              {chargement ? "…" : "Ouvrir la commande"}
            </Button>
          </div>
        </form>
        {erreur && (
          <p role="alert" className="hc-text-body texte-erreur" style={{ marginTop: "var(--hc-space-3)" }}>
            {erreur}
          </p>
        )}
      </div>
    </div>
  );
}
