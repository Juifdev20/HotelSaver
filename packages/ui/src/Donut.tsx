import * as React from "react";
import "./donut.css";

export interface DonutSegment {
  valeur: number;
  /** Couleur CSS (ex. "var(--hc-danger)") — reste agnostique du domaine métier. */
  couleur: string;
}

export interface DonutProps {
  segments: DonutSegment[];
  taille?: number;
  epaisseur?: number;
  /** Contenu affiché au centre de l'anneau (ex. le pourcentage). */
  children?: React.ReactNode;
  /** Description textuelle du graphique pour les lecteurs d'écran (ex. « Occupation : 3 occupées, 5 libres »). */
  titre?: string;
}

/**
 * Anneau de répartition en SVG pur — pas de dépendance de graphique
 * supplémentaire pour un seul donut (section 9 de la charte). Segments
 * dessinés via stroke-dasharray ; total à 0 → anneau neutre vide plutôt
 * qu'un graphique cassé.
 */
export function Donut({ segments, taille = 140, epaisseur = 16, children, titre = "Graphique en anneau" }: DonutProps) {
  const rayon = (taille - epaisseur) / 2;
  const circonference = 2 * Math.PI * rayon;
  const total = segments.reduce((somme, s) => somme + s.valeur, 0);

  let decalageCumule = 0;

  return (
    <div className="hc-donut" style={{ width: taille, height: taille }}>
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} role="img" aria-label={titre}>
        <title>{titre}</title>
        <circle
          cx={taille / 2}
          cy={taille / 2}
          r={rayon}
          fill="none"
          stroke="var(--hc-border)"
          strokeWidth={epaisseur}
        />
        {total > 0 &&
          segments
            .filter((s) => s.valeur > 0)
            .map((segment, index) => {
              const longueur = (segment.valeur / total) * circonference;
              const cercle = (
                <circle
                  key={index}
                  cx={taille / 2}
                  cy={taille / 2}
                  r={rayon}
                  fill="none"
                  stroke={segment.couleur}
                  strokeWidth={epaisseur}
                  strokeDasharray={`${longueur} ${circonference - longueur}`}
                  strokeDashoffset={-decalageCumule}
                  strokeLinecap="butt"
                  transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
                />
              );
              decalageCumule += longueur;
              return cercle;
            })}
      </svg>
      {children && <div className="hc-donut__centre">{children}</div>}
    </div>
  );
}
