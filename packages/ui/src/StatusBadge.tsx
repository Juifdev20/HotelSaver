import * as React from "react";
import "./status-badge.css";

/** Les 5 couleurs de statut de la section 12.1 — jamais une autre couleur pour un badge. */
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface StatusBadgeProps {
  tone: StatusTone;
  /** Toujours affiché à côté de la couleur — jamais la couleur seule (section 12.5). */
  label: string;
}

export function StatusBadge({ tone, label }: StatusBadgeProps) {
  return (
    <span className={`hc-status-badge hc-status-badge--${tone}`} data-tone={tone}>
      {label}
    </span>
  );
}
