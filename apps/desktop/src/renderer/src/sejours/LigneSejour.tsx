import * as React from "react";
import { CircleCheck, LogIn, LogOut } from "lucide-react";
import type { ProposeActionSejour } from "@hotel-chicago/regles";
import type { Reservation, StatutReservation } from "@hotel-chicago/types";
import { StatusBadge, formatMontant, type StatusTone } from "@hotel-chicago/ui";
import { BadgePayeEnLigne } from "../screens/PayeEnLigne";
import "./sejours.css";

export type GenreLigne = "arrivee" | "depart" | "present";

const LABEL_STATUT: Record<StatutReservation, string> = {
  EN_ATTENTE: "En attente",
  CONFIRMEE: "Confirmée",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
  ANNULEE: "Annulée",
};
const TONE_STATUT: Record<StatutReservation, StatusTone> = { EN_ATTENTE: "warning", CONFIRMEE: "info", EN_COURS: "success", TERMINEE: "neutral", ANNULEE: "danger" };

const FORMAT_JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Africa/Lubumbashi" });
const FORMAT_JOUR_SEMAINE = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "Africa/Lubumbashi" });

export function nuitsDe(r: Pick<Reservation, "dateArrivee" | "dateDepart">): number {
  return Math.max(1, Math.round((new Date(r.dateDepart).getTime() - new Date(r.dateArrivee).getTime()) / 86_400_000));
}

function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  return ((mots[0]?.[0] ?? "?") + (mots.length > 1 ? (mots[mots.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export interface LigneSejourProps {
  sejour: Reservation;
  genre: GenreLigne;
  action: ProposeActionSejour | null;
  actionEnCours?: boolean;
  chambrePrise?: boolean;
  paiementsEnLigne?: Parameters<typeof BadgePayeEnLigne>[0]["paiements"];
  onOuvrir: () => void;
  onAction: (action: ProposeActionSejour) => void;
}

/** Une ligne de « Aujourd'hui » : qui, quelle chambre, quelles dates, où en est le paiement, et UN bouton — la bonne action. */
export function LigneSejour({ sejour, genre, action, actionEnCours = false, chambrePrise = false, paiementsEnLigne, onOuvrir, onAction }: LigneSejourProps) {
  const nuits = nuitsDe(sejour);
  const acompte = Number(sejour.acompte);
  const devise = sejour.chambre.devise;
  const tone: StatusTone = genre === "depart" ? "warning" : genre === "present" ? "success" : TONE_STATUT[sejour.statut];
  const libelle = genre === "depart" ? "À facturer" : genre === "present" ? "Présent" : LABEL_STATUT[sejour.statut];
  const Icone = action?.id === "checkin" ? LogIn : action?.id === "facturer" ? LogOut : CircleCheck;
  return (
    <div className="sejour-ligne" role="row">
      <div className="sejour-ligne__qui">
        <span className="sejour-avatar" aria-hidden="true">
          {initiales(sejour.client.nom)}
        </span>
        <div style={{ minWidth: 0 }}>
          <button type="button" className="sejour-ligne__nom" onClick={onOuvrir} aria-label={`Ouvrir le séjour de ${sejour.client.nom}, chambre ${sejour.chambre.numero}`}>
            {sejour.client.nom}
          </button>
          {sejour.client.telephone && <span className="sejour-ligne__sous">{sejour.client.telephone}</span>}
          {chambrePrise && <span className="sejour-ligne__alerte">Chambre déjà réservée par un autre client</span>}
        </div>
      </div>
      <div className="sejour-ligne__chambre-col">
        <span className="sejour-ligne__chambre">
          {sejour.chambre.numero} · {sejour.chambre.type}
        </span>
      </div>
      <div className="sejour-ligne__dates">
        {FORMAT_JOUR.format(new Date(sejour.dateArrivee))} → {FORMAT_JOUR.format(new Date(sejour.dateDepart))} · {nuits} nuit{nuits > 1 ? "s" : ""}
        {genre !== "arrivee" && <span className="sejour-ligne__sous">départ {FORMAT_JOUR_SEMAINE.format(new Date(sejour.dateDepart))}</span>}
      </div>
      <div className="sejour-ligne__acompte hc-text-price">
        {acompte > 0 ? `${formatMontant(acompte, devise)} payé` : "Aucun acompte"}
        <BadgePayeEnLigne paiements={paiementsEnLigne} />
      </div>
      <div className="sejour-ligne__statut">
        <StatusBadge tone={tone} label={libelle} />
      </div>
      <div className="sejour-ligne__action">
        {action && (
          <button
            type="button"
            className={`sejour-action${action.id === "checkin" || action.id === "facturer" ? " sejour-action--plein" : ""}`}
            disabled={actionEnCours}
            onClick={() => onAction(action)}
            aria-label={`${action.libelle}, ${sejour.client.nom}`}
          >
            <Icone size={18} aria-hidden="true" />
            {actionEnCours ? "…" : action.libelle}
          </button>
        )}
      </div>
    </div>
  );
}
