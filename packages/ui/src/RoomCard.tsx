import * as React from "react";
import { Devise } from "@hotel-chicago/types";
import { StatusBadge, StatusTone } from "./StatusBadge";
import { formatMontant } from "./format-montant";
import "./room-card.css";

export interface RoomCardProps {
  numero: string;
  type: string;
  prix: number | string;
  devise: Devise;
  statutTone: StatusTone;
  statutLabel: string;
  onClick?: () => void;
}

/**
 * Section 12.5 : numéro, type, prix, statut. Le mapping statut → (tone, label)
 * est délibérément laissé à l'appelant (ex. apps/desktop) : ce paquet reste
 * agnostique du domaine métier (StatutChambre, etc.), il ne fait que
 * présenter ce qu'on lui donne — voir DECISIONS.md.
 */
export function RoomCard({ numero, type, prix, devise, statutTone, statutLabel, onClick }: RoomCardProps) {
  const classes = ["hc-room-card", onClick ? "hc-room-card--cliquable" : ""].filter(Boolean).join(" ");

  const contenu = (
    <>
      <div className="hc-room-card__entete">
        <span className="hc-text-heading">{numero}</span>
        <StatusBadge tone={statutTone} label={statutLabel} />
      </div>
      <p className="hc-text-body hc-room-card__type">{type}</p>
      <p className="hc-text-price-lg">{formatMontant(prix, devise)}</p>
    </>
  );

  if (!onClick) {
    return <div className={classes}>{contenu}</div>;
  }

  return (
    <div
      className={classes}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(evenement) => {
        if (evenement.key === "Enter" || evenement.key === " ") {
          evenement.preventDefault();
          onClick();
        }
      }}
    >
      {contenu}
    </div>
  );
}
