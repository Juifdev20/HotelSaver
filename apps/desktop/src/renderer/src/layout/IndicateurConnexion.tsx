import * as React from "react";
import { useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";

const INTERVALLE_MS = 20_000; // section 10.2 : vérification toutes les 15 à 30 s

/**
 * Affiche l'état RÉEL de la connexion au serveur de l'hôtel (ping /health).
 * Volontairement pas « Synchronisé » : le moteur de synchronisation hors
 * ligne (section 10) n'existe pas encore côté app, afficher cet état serait
 * mentir. Couleur + mot, jamais la couleur seule.
 */
export function IndicateurConnexion({ client }: { client: ClientApi }) {
  const [joignable, setJoignable] = useState<boolean | null>(null);

  useEffect(() => {
    let actif = true;
    const verifier = () => client.estJoignable().then((ok) => actif && setJoignable(ok));
    verifier();
    const minuterie = window.setInterval(verifier, INTERVALLE_MS);
    return () => {
      actif = false;
      window.clearInterval(minuterie);
    };
  }, [client]);

  const etat = joignable === null ? "verification" : joignable ? "en-ligne" : "hors-ligne";
  const libelle = joignable === null ? "Vérification…" : joignable ? "Serveur connecté" : "Serveur injoignable";

  return (
    <span className={`indicateur-connexion indicateur-connexion--${etat}`} data-testid="indicateur-connexion" role="status">
      <span className="indicateur-connexion__point" aria-hidden="true" />
      <span className="hc-text-caption">{libelle}</span>
    </span>
  );
}
