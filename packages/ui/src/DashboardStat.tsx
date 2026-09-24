import * as React from "react";
import type { StatusTone } from "./StatusBadge";
import "./dashboard-stat.css";

export interface DashboardStatProps {
  libelle: string;
  /** Déjà formaté par l'appelant (formatMontant pour un montant) — jamais formaté ici. */
  valeur: string | number;
  precision?: string;
  /** Pastille de couleur devant le libellé : toujours accompagnée du mot (section 12.5). */
  tone?: StatusTone;
  /** Icône dans un cercle coloré au-dessus du libellé (section 8 de la charte). */
  icone?: React.ReactNode;
  /** Si fourni, la carte devient un bouton (ex. filtre). */
  onClick?: () => void;
  selectionne?: boolean;
}

/** Carte KPI : icône, libellé, grand chiffre, précision (section 8/12.5). */
export function DashboardStat({ libelle, valeur, precision, tone, icone, onClick, selectionne }: DashboardStatProps) {
  const classes = ["hc-stat", selectionne ? "hc-stat--selectionne" : ""].filter(Boolean).join(" ");

  const contenu = (
    <>
      {icone && <span className={`hc-stat__icone hc-stat__icone--${tone ?? "neutral"}`}>{icone}</span>}
      <span className="hc-text-label hc-stat__libelle">
        {tone && !icone && <span className={`hc-stat__pastille hc-stat__pastille--${tone}`} aria-hidden="true" />}
        {libelle}
      </span>
      <span className="hc-text-price-lg">{valeur}</span>
      {precision && <span className="hc-text-caption hc-stat__precision">{precision}</span>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} aria-pressed={selectionne ?? false}>
        {contenu}
      </button>
    );
  }
  return <div className={classes}>{contenu}</div>;
}
