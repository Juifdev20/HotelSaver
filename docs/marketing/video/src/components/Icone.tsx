import React from 'react';

/** Icônes au trait (même dessin que les affiches et l'application). */
const D: Record<string, React.ReactNode> = {
  lit: <path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01" />,
  caisse: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h2m3 0h3M8 15h2m3 0h3" /></>,
  cafe: <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M8 3v3m4-3v3" />,
  agenda: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4m8-4v4" /></>,
  boite: <path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8" />,
  graphe: <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />,
  scan: <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />,
  hors: <path d="M3 3l18 18M8.5 8.8A7 7 0 0 0 5 11m4.7.3A4 4 0 0 1 12 10.7m6.2.3a10 10 0 0 0-5.4-2.9M12 18.2h.01" />,
  wifi: <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />,
  sync: <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.4 6.4L3 16M8 16H3v5" />,
  check: <path d="M20 6 9 17l-5-5" />,
  recu: <path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5-2 1.5-2.5-1.5L5 21zM9 8h6M9 12h6M9 16h3" />,
  bouclier: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5" />,
  equipe: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  globe: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />,
  carte: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>,
  telephone: <><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></>,
  ordinateur: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M2 20h20M9 16v4m6-4v4" /></>,
  flamme: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5" />,
  dollar: <path d="M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5 9 9.4 12 10s5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3" />,
  cadeau: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" /></>,
  telecharger: <path d="M12 3v12m0 0-4-4m4 4 4-4M5 19h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  maison: <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
};

export const Icone: React.FC<{ nom: string; taille: number; couleur: string; epaisseur?: number }> = ({ nom, taille, couleur, epaisseur = 2 }) => (
  <svg viewBox="0 0 24 24" width={taille} height={taille} fill="none" stroke={couleur} strokeWidth={epaisseur} strokeLinecap="round" strokeLinejoin="round">
    {D[nom]}
  </svg>
);

/** Logo WhatsApp simplifié (bulle et combiné), sans nom de marque déformé. */
export const BulleWhatsApp: React.FC<{ taille: number }> = ({ taille }) => (
  <svg viewBox="0 0 32 32" width={taille} height={taille}>
    <circle cx="16" cy="16" r="16" fill="#25D366" />
    <path d="M16 7.2a8.8 8.8 0 0 0-7.6 13.2L7.2 24.8l4.5-1.2A8.8 8.8 0 1 0 16 7.2z" fill="#fff" />
    <path d="M12.6 11.6c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .6l-.5.7c-.1.2-.2.3 0 .6.5.9 1.1 1.6 1.9 2.2.6.5 1.2.8 1.6 1 .3.1.4.1.6-.1l.7-.9c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.2.4.4 0 .4-.1 1.2-.7 1.7-.6.5-1.6.7-2.6.4-1.3-.4-2.8-1.2-4.2-2.6-1.3-1.3-2.2-2.9-2.5-4-.3-1.2 0-2.1.3-2.8z" fill="#25D366" />
  </svg>
);
