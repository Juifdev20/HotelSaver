import * as React from "react";
import { Brush, Check, CalendarDays, LogIn, LogOut, User } from "lucide-react";
import type { ProposeAction, SejoursDeLaChambre } from "@hotel-chicago/regles";
import { Devise, StatutChambre, type Chambre } from "@hotel-chicago/types";
import { StatusBadge, formatMontant, type StatusTone } from "@hotel-chicago/ui";

const FORMAT_JOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Africa/Lubumbashi" });
const jour = (iso: string) => FORMAT_JOUR.format(new Date(iso));

const ICONE_ACTION: Record<ProposeAction["id"], React.ReactNode> = {
  arrivee: <LogIn size={19} aria-hidden="true" />,
  depart: <LogOut size={19} aria-hidden="true" />,
  voir: <CalendarDays size={19} aria-hidden="true" />,
  propre: <Check size={19} strokeWidth={3} aria-hidden="true" />,
};

export interface CarteChambreProps {
  chambre: Chambre;
  tone: StatusTone;
  libelleStatut: string;
  sejours?: SejoursDeLaChambre;
  action: ProposeAction | null;
  onAction: (action: ProposeAction) => void;
  /** Menu ⋮ (changer le statut à la main ; patron : modifier, supprimer). */
  menu?: React.ReactNode;
}

/** Une chambre : son numéro, son état, qui l'occupe ou va l'occuper, et UNE action — la bonne selon l'état. */
export function CarteChambre({ chambre, tone, libelleStatut, sejours, action, onAction, menu }: CarteChambreProps) {
  const enCours = sejours?.enCours;
  const prochaine = sejours?.prochaine;
  let ligne1: React.ReactNode = null;
  let ligne2: string | null = null;
  if (chambre.statut === StatutChambre.OCCUPEE) {
    if (enCours) {
      ligne1 = (
        <>
          <User size={16} aria-hidden="true" /> {enCours.client.nom}
        </>
      );
      ligne2 = `jusqu'au ${jour(enCours.dateDepart)}`;
    } else ligne2 = "Aucun séjour enregistré pour cette chambre.";
  } else if (chambre.statut === StatutChambre.RESERVEE) {
    if (prochaine) {
      ligne1 = (
        <>
          <User size={16} aria-hidden="true" /> {prochaine.client.nom}
        </>
      );
      ligne2 = `arrive le ${jour(prochaine.dateArrivee)}`;
    } else ligne2 = "Aucun séjour confirmé pour cette chambre.";
  } else if (chambre.statut === StatutChambre.NETTOYAGE) {
    ligne1 = (
      <>
        <Brush size={16} aria-hidden="true" /> À nettoyer
      </>
    );
    ligne2 = prochaine ? `avant l'arrivée du ${jour(prochaine.dateArrivee)}` : "Une fois propre, elle redevient libre.";
  } else {
    ligne2 = prochaine ? `Prochaine arrivée le ${jour(prochaine.dateArrivee)}` : "Prête à accueillir un client.";
  }

  return (
    <article className={`chambre-carte chambre-carte--${tone}`} aria-label={`Chambre ${chambre.numero}, ${chambre.type}, ${libelleStatut}`}>
      <div className="chambre-carte__haut">
        <span className="chambre-carte__numero">{chambre.numero}</span>
        <span className="chambre-carte__droite">
          <StatusBadge tone={tone} label={libelleStatut} />
          {menu}
        </span>
      </div>
      <p className="chambre-carte__type">
        {chambre.type} · <strong>{formatMontant(chambre.prixParNuit, chambre.devise as Devise)}</strong> / nuit
      </p>
      <div className="chambre-carte__occupant">
        {ligne1 && <p className="chambre-carte__nom">{ligne1}</p>}
        {ligne2 && <p className="chambre-carte__detail">{ligne2}</p>}
      </div>
      {action && (
        <button type="button" className={`chambre-action${action.id === "arrivee" ? " chambre-action--plein" : ""}`} onClick={() => onAction(action)}>
          {ICONE_ACTION[action.id]}
          {action.libelle}
        </button>
      )}
    </article>
  );
}
