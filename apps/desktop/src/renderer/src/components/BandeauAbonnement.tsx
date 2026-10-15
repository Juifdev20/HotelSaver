import * as React from "react";
import { bandeauAbonnement } from "@hotel-chicago/regles";
import type { EtatAbonnement } from "@hotel-chicago/types";
import { AlertTriangle, ChevronRight, XCircle } from "lucide-react";
import "../screens/abonnement.css";

export interface BandeauAbonnementProps {
  /** État de l'abonnement du profil (éventuellement mémorisé : le texte suit l'horloge). */
  etat: EtatAbonnement | undefined | null;
  /** Ouvre l'écran Abonnement. */
  onOuvrir: () => void;
}

/**
 * Bandeau en haut de l'application quand l'abonnement se termine (orange) ou vient de se terminer (rouge). Cliquable : mène à l'écran Abonnement.
 * Le texte complet est lu par les lecteurs d'écran ; la couleur n'est jamais seule (icône + mots).
 */
export function BandeauAbonnement({ etat, onOuvrir }: BandeauAbonnementProps) {
  const bandeau = bandeauAbonnement(etat);
  if (!bandeau) return null;
  const Icone = bandeau.niveau === "danger" ? XCircle : AlertTriangle;
  return (
    <button
      type="button"
      className={`bandeau-abonnement bandeau-abonnement--${bandeau.niveau} hc-text-body`}
      onClick={onOuvrir}
      data-testid="bandeau-abonnement"
      aria-label={`${bandeau.texte} Ouvrir la page Abonnement.`}
    >
      <Icone size={18} aria-hidden="true" />
      <span className="bandeau-abonnement__texte" aria-hidden="true">
        {bandeau.texte}
      </span>
      <span className="bandeau-abonnement__action" aria-hidden="true">
        Voir l'abonnement
      </span>
      <ChevronRight size={16} aria-hidden="true" />
    </button>
  );
}
