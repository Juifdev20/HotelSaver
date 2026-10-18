import * as React from "react";
import { View } from "react-native";
import Svg, { Circle, Path, Rect, Text as SvgText } from "react-native-svg";
import type { OperateurMobileMoney } from "@hotel-chicago/types";

/**
 * Logos des réseaux Mobile Money (18/10/2026) : mêmes dessins que `@hotel-chicago/ui` (site et bureau), en react-native-svg —
 * affichés hors ligne, nets à toutes les tailles. Décoratifs : le nom du réseau est toujours écrit à côté.
 */

interface LogoProps {
  taille?: number;
}

export function LogoMpesa({ taille = 40 }: LogoProps) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 48 48">
      <Rect width="48" height="48" rx="11" fill="#FFFFFF" />
      <Rect x="0.5" y="0.5" width="47" height="47" rx="10.5" fill="none" stroke="#E6E9EF" />
      <Circle cx="24" cy="17" r="9" fill="#E60000" />
      <Path d="M24 10.5a6.5 6.5 0 0 0-1.6 12.8c.2-3.6 2.3-6.7 5.6-8.3a6.4 6.4 0 0 0-4-4.5z" fill="#FFFFFF" />
      <SvgText x="24" y="39" textAnchor="middle" fontWeight="800" fontSize="10.5" fill="#4AA829">
        M-PESA
      </SvgText>
    </Svg>
  );
}

export function LogoAirtel({ taille = 40 }: LogoProps) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 48 48">
      <Rect width="48" height="48" rx="11" fill="#ED1C24" />
      <Path
        d="M30.5 12.5c-6.9-2.4-15.6 2.6-16.9 10.3-.9 5.3 2.4 9 6.9 8.7 4.7-.3 8.3-4.4 8.1-8.6-.1-2.4-1.9-3.7-3.9-3.3"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <SvgText x="24" y="42" textAnchor="middle" fontWeight="700" fontSize="8" fill="#FFFFFF">
        airtel
      </SvgText>
    </Svg>
  );
}

export function LogoOrange({ taille = 40 }: LogoProps) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 48 48">
      <Rect width="48" height="48" rx="11" fill="#000000" />
      <Rect x="9" y="9" width="30" height="30" fill="#FF7900" />
      <SvgText x="12" y="35" fontWeight="700" fontSize="7.5" fill="#FFFFFF">
        orange
      </SvgText>
    </Svg>
  );
}

export function LogoAfricell({ taille = 40 }: LogoProps) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 48 48">
      <Rect width="48" height="48" rx="11" fill="#6C2C91" />
      <Circle cx="24" cy="19" r="7.5" fill="none" stroke="#FFFFFF" strokeWidth="3" />
      <Circle cx="29.5" cy="13.5" r="2.4" fill="#F39200" />
      <SvgText x="24" y="39" textAnchor="middle" fontWeight="700" fontSize="8.2" fill="#FFFFFF">
        africell
      </SvgText>
    </Svg>
  );
}

const LOGOS: Record<OperateurMobileMoney, (p: LogoProps) => React.ReactElement> = {
  VODACOM: LogoMpesa,
  AIRTEL: LogoAirtel,
  ORANGE: LogoOrange,
  AFRICELL: LogoAfricell,
};

export function LogoOperateur({ operateur, taille }: LogoProps & { operateur: OperateurMobileMoney }) {
  const Logo = LOGOS[operateur];
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Logo taille={taille} />
    </View>
  );
}

/** Rangée des quatre réseaux (aperçu « Mobile Money accepté »). */
export function LogosMobileMoney({ taille = 24 }: LogoProps) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <LogoMpesa taille={taille} />
      <LogoAirtel taille={taille} />
      <LogoOrange taille={taille} />
      <LogoAfricell taille={taille} />
    </View>
  );
}
