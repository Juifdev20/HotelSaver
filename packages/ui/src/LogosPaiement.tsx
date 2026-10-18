import * as React from "react";
import type { OperateurMobileMoney } from "@hotel-chicago/types";

/**
 * Marques des moyens de paiement (17/10/2026 ; partagées par le site et le bureau — redessinées en react-native-svg pour le mobile) : dessinées en SVG, aux couleurs de
 * chaque réseau — affichées hors ligne, nettes à toutes les tailles, sans image distante à charger. Ce sont
 * des repères visuels pour reconnaître son réseau d'un coup d'œil ; le nom complet reste écrit à côté.
 */

interface LogoProps {
  taille?: number;
}

/** M-Pesa (Vodacom) : pastille rouge Vodacom, « M-PESA » en vert. */
export function LogoMpesa({ taille = 40 }: LogoProps) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 48 48" role="img" aria-label="M-Pesa">
      <rect width="48" height="48" rx="11" fill="#FFFFFF" />
      <rect x="0.5" y="0.5" width="47" height="47" rx="10.5" fill="none" stroke="#E6E9EF" />
      <circle cx="24" cy="17" r="9" fill="#E60000" />
      <path d="M24 10.5a6.5 6.5 0 0 0-1.6 12.8c.2-3.6 2.3-6.7 5.6-8.3a6.4 6.4 0 0 0-4-4.5z" fill="#FFFFFF" />
      <text x="24" y="39" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="10.5" fill="#4AA829">
        M-PESA
      </text>
    </svg>
  );
}

/** Airtel Money : fond rouge Airtel, vague blanche. */
export function LogoAirtel({ taille = 40 }: LogoProps) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 48 48" role="img" aria-label="Airtel Money">
      <rect width="48" height="48" rx="11" fill="#ED1C24" />
      <path
        d="M30.5 12.5c-6.9-2.4-15.6 2.6-16.9 10.3-.9 5.3 2.4 9 6.9 8.7 4.7-.3 8.3-4.4 8.1-8.6-.1-2.4-1.9-3.7-3.9-3.3"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <text x="24" y="42" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="8" fill="#FFFFFF">
        airtel
      </text>
    </svg>
  );
}

/** Orange Money : carré orange, « orange » en blanc en bas à gauche. */
export function LogoOrange({ taille = 40 }: LogoProps) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 48 48" role="img" aria-label="Orange Money">
      <rect width="48" height="48" rx="11" fill="#000000" />
      <rect x="9" y="9" width="30" height="30" fill="#FF7900" />
      <text x="12" y="35" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="7.5" fill="#FFFFFF">
        orange
      </text>
    </svg>
  );
}

/** Africell Money : fond violet, « africell » en blanc. */
export function LogoAfricell({ taille = 40 }: LogoProps) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 48 48" role="img" aria-label="Africell Money">
      <rect width="48" height="48" rx="11" fill="#6C2C91" />
      <circle cx="24" cy="19" r="7.5" fill="none" stroke="#FFFFFF" strokeWidth="3" />
      <circle cx="29.5" cy="13.5" r="2.4" fill="#F39200" />
      <text x="24" y="39" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="8.2" fill="#FFFFFF">
        africell
      </text>
    </svg>
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
  return <Logo taille={taille} />;
}

/** Visa : « VISA » bleu sur fond blanc. */
export function LogoVisa({ taille = 40 }: LogoProps) {
  return (
    <svg width={taille * 1.5} height={taille} viewBox="0 0 72 48" role="img" aria-label="Visa">
      <rect width="72" height="48" rx="9" fill="#FFFFFF" />
      <rect x="0.5" y="0.5" width="71" height="47" rx="8.5" fill="none" stroke="#E6E9EF" />
      <text x="36" y="31" textAnchor="middle" fontFamily="Arial Black, Arial, Helvetica, sans-serif" fontStyle="italic" fontWeight="900" fontSize="19" fill="#1A1F71">
        VISA
      </text>
    </svg>
  );
}

/** Mastercard : deux cercles rouge et jaune entrelacés. */
export function LogoMastercard({ taille = 40 }: LogoProps) {
  return (
    <svg width={taille * 1.5} height={taille} viewBox="0 0 72 48" role="img" aria-label="Mastercard">
      <rect width="72" height="48" rx="9" fill="#FFFFFF" />
      <rect x="0.5" y="0.5" width="71" height="47" rx="8.5" fill="none" stroke="#E6E9EF" />
      <circle cx="29" cy="24" r="12" fill="#EB001B" />
      <circle cx="43" cy="24" r="12" fill="#F79E1B" />
      <path d="M36 14.4a12 12 0 0 1 0 19.2 12 12 0 0 1 0-19.2z" fill="#FF5F00" />
    </svg>
  );
}

/** Pile de logos Mobile Money (aperçu d'un moyen de paiement). */
export function LogosMobileMoney({ taille = 26 }: LogoProps) {
  return (
    <span className="logos-pile" aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <LogoMpesa taille={taille} />
      <LogoAirtel taille={taille} />
      <LogoOrange taille={taille} />
      <LogoAfricell taille={taille} />
    </span>
  );
}

/** Pile de logos des cartes acceptées. */
export function LogosCartes({ taille = 26 }: LogoProps) {
  return (
    <span className="logos-pile" aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <LogoVisa taille={taille} />
      <LogoMastercard taille={taille} />
    </span>
  );
}
