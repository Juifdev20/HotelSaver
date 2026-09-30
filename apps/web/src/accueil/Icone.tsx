import * as React from "react";
import type { NomIcone } from "./donnees";

const CHEMINS: Record<NomIcone, React.ReactNode> = {
  lit: <path d="M3 18v-7a2 2 0 0 1 2-2h6a3 3 0 0 1 3 3v6M3 15h18v3M3 18v2M21 18v2" />,
  tasse: <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zm12 1h2a2 2 0 0 1 0 4h-2M7 3v3M11 3v3" />,
  wifi: <path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" />,
  monnaie: <path d="M12 3v18M16 7.5c-.6-1.2-2-2-4-2-2.2 0-3.8 1-3.8 2.7 0 4 8 2 8 6 0 1.8-1.7 2.8-4.2 2.8-2.2 0-3.7-.9-4.3-2.3" />,
  cle: <path d="M14 10a4 4 0 1 0-3.9 4L21 14v3h-3v3h-3v-3l-2-2" />,
  globe: <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0zm0 0h18M12 3c2.5 2.5 3.5 5.5 3.5 9S14.5 18.5 12 21c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z" />,
};

export function Icone({ nom }: { nom: NomIcone }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {CHEMINS[nom]}
    </svg>
  );
}
