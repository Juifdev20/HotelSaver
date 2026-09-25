import * as React from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { couleurs } from "../tokens";

export interface SegmentDonut {
  valeur: number;
  couleur: string;
}

export interface DonutProps {
  segments: SegmentDonut[];
  taille?: number;
  epaisseur?: number;
  enfant?: React.ReactNode;
}

/** Portage RN (react-native-svg) de `packages/ui/src/Donut.tsx` — même
 * logique (anneau SVG pur, pas de lib de graphique), dupliqué pour la même
 * raison que `formatMontant.ts` : `packages/ui` n'est pas utilisable côté
 * React Native (imports .css en effet de bord). */
export function Donut({ segments, taille = 96, epaisseur = 12, enfant }: DonutProps) {
  const rayon = (taille - epaisseur) / 2;
  const circonference = 2 * Math.PI * rayon;
  const total = segments.reduce((s, seg) => s + seg.valeur, 0);
  let decalageCumule = 0;

  return (
    <View style={{ width: taille, height: taille, alignItems: "center", justifyContent: "center" }}>
      <Svg width={taille} height={taille} style={{ position: "absolute" }}>
        <Circle
          cx={taille / 2}
          cy={taille / 2}
          r={rayon}
          stroke={couleurs.bordure}
          strokeWidth={epaisseur}
          fill="none"
        />
        {total > 0 &&
          segments
            .filter((s) => s.valeur > 0)
            .map((segment, index) => {
              const longueur = (segment.valeur / total) * circonference;
              const cercle = (
                <Circle
                  key={index}
                  cx={taille / 2}
                  cy={taille / 2}
                  r={rayon}
                  stroke={segment.couleur}
                  strokeWidth={epaisseur}
                  strokeDasharray={`${longueur} ${circonference - longueur}`}
                  strokeDashoffset={-decalageCumule}
                  strokeLinecap="butt"
                  fill="none"
                  transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
                />
              );
              decalageCumule += longueur;
              return cercle;
            })}
      </Svg>
      {enfant}
    </View>
  );
}
