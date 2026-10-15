import * as React from "react";
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { couleurs } from "../tokens";

/**
 * Avatar illustré commun à tous les comptes (demande du patron, 15/10/2026) :
 * un membre du personnel en veste marine et cravate bleue sur fond dégradé,
 * à la place de l'initiale du nom. Vectoriel : net à toutes les tailles, sans
 * image à télécharger.
 */
export function AvatarUtilisateur({ taille = 38 }: { taille?: number }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="fondAvatar" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#CFE3FF" />
          <Stop offset="1" stopColor={couleurs.bleu} />
        </LinearGradient>
        <ClipPath id="disqueAvatar">
          <Circle cx="32" cy="32" r="32" />
        </ClipPath>
      </Defs>
      <G clipPath="url(#disqueAvatar)">
        <Rect width="64" height="64" fill="url(#fondAvatar)" />
        {/* Veste */}
        <Path d="M8 66 C8 51 19 43 32 43 C45 43 56 51 56 66 Z" fill={couleurs.navy} />
        {/* Cou */}
        <Rect x="27.5" y="35" width="9" height="10" rx="3" fill="#9C6440" />
        {/* Col de chemise et cravate */}
        <Path d="M25.5 43.5 L32 53 L38.5 43.5 Z" fill="#FFFFFF" />
        <Path d="M30.6 46 L33.4 46 L34.4 54.5 L32 57.5 L29.6 54.5 Z" fill={couleurs.bleu} />
        {/* Tête */}
        <Circle cx="32" cy="27" r="11" fill="#B5774D" />
        {/* Cheveux */}
        <Path
          d="M20.8 26.5 C20.4 18.5 25.5 14.5 32 14.5 C38.5 14.5 43.6 18.5 43.2 26.5 C41.8 21.8 37.6 19.6 32 19.6 C26.4 19.6 22.2 21.8 20.8 26.5 Z"
          fill="#2A1A10"
        />
      </G>
      <Circle cx="32" cy="32" r="31" fill="none" stroke="#FFFFFF" strokeWidth="2" />
    </Svg>
  );
}
