import * as React from "react";
import {
  Bus,
  Coffee,
  Flower2,
  ParkingCircle,
  Presentation,
  ShieldCheck,
  Shirt,
  Snowflake,
  Sparkles,
  UtensilsCrossed,
  Waves,
  Wifi,
  Wine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IconeService, ReseauSocial } from "@hotel-chicago/types";

export const ICONES_SERVICES: Record<IconeService, LucideIcon> = {
  restaurant: UtensilsCrossed,
  piscine: Waves,
  wifi: Wifi,
  parking: ParkingCircle,
  navette: Bus,
  climatisation: Snowflake,
  "salle-conference": Presentation,
  bar: Wine,
  spa: Flower2,
  securite: ShieldCheck,
  blanchisserie: Shirt,
  "petit-dejeuner": Coffee,
  autre: Sparkles,
};

/** lucide v1 n'a plus d'icônes de marques : SVG simples, et pastilles de lettres pour TikTok/X. */
export function IconeReseau({ reseau, taille = 20 }: { reseau: ReseauSocial; taille?: number }) {
  const svg = { width: taille, height: taille, viewBox: "0 0 24 24", "aria-hidden": true as const, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (reseau === "facebook") {
    return (
      <svg {...svg}>
        <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v7h4v-7h3l1-4h-4V8z" />
      </svg>
    );
  }
  if (reseau === "instagram") {
    return (
      <svg {...svg}>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <path d="M17.5 6.5h.01" />
      </svg>
    );
  }
  if (reseau === "youtube") {
    return (
      <svg {...svg}>
        <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
        <path d="M10 9.5v5l4.5-2.5-4.5-2.5z" />
      </svg>
    );
  }
  return (
    <span aria-hidden="true" style={{ fontWeight: 700, fontSize: taille * 0.8 }}>
      {reseau === "tiktok" ? "Tk" : "X"}
    </span>
  );
}

export const LIBELLE_RESEAU: Record<ReseauSocial, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
};
