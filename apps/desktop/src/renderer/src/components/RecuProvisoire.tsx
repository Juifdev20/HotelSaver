import * as React from "react";
import { StatusBadge } from "@hotel-chicago/ui";

/** Reçu fait hors connexion : son numéro (TEMP-…) est provisoire, le vrai est attribué par le serveur à la synchronisation. */
export function estRecuProvisoire(numeroRecu: string | null | undefined): boolean {
  return typeof numeroRecu === "string" && numeroRecu.startsWith("TEMP-");
}

export const PHRASE_RECU_PROVISOIRE =
  "Reçu provisoire : le numéro définitif sera attribué à la synchronisation (le reçu reste valable).";

/** Badge « Provisoire » (information, pas une erreur) — rien si le reçu est définitif. */
export function BadgeProvisoire({ numeroRecu }: { numeroRecu: string | null | undefined }) {
  if (!estRecuProvisoire(numeroRecu)) return null;
  return <StatusBadge tone="info" label="Provisoire" />;
}
