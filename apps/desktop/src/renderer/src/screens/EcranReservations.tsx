import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { Reservation, StatutReservation } from "@hotel-chicago/types";
import { Button, StatusBadge, StatusTone, formatMontant } from "@hotel-chicago/ui";
import { CalendarDays, Plus, Search } from "lucide-react";
import type { IdPage } from "../navigation";
import { EcranReservationDetail } from "./EcranReservationDetail";
import { EcranNouvelleReservation } from "./EcranNouvelleReservation";

export interface EcranReservationsProps {
  client: ClientApi;
  onNaviguer: (page: IdPage) => void;
  /** Ouvre l'écran Facturation directement sur ce séjour. */
  onFacturer: (reservationId: string) => void;
}

type Vue = { id: "liste" } | { id: "detail"; reservationId: string } | { id: "nouvelle" };

export const LABEL_STATUT: Record<StatutReservation, string> = {
  EN_ATTENTE: "En attente",
  CONFIRMEE: "Confirmée",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
  ANNULEE: "Annulée",
};

export const TONE_STATUT: Record<StatutReservation, StatusTone> = {
  EN_ATTENTE: "warning",
  CONFIRMEE: "info",
  EN_COURS: "success",
  TERMINEE: "neutral",
  ANNULEE: "danger",
};

const FILTRES: { id: StatutReservation | null; libelle: string }[] = [
  { id: null, libelle: "Toutes" },
  { id: "EN_ATTENTE", libelle: "En attente" },
  { id: "CONFIRMEE", libelle: "Confirmées" },
  { id: "EN_COURS", libelle: "En cours" },
  { id: "TERMINEE", libelle: "Terminées" },
  { id: "ANNULEE", libelle: "Annulées" },
];

export function dateCourte(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

function nombreDeNuits(dateArrivee: string, dateDepart: string): number {
  return Math.max(1, Math.round((new Date(dateDepart).getTime() - new Date(dateArrivee).getTime()) / 86400000));
}

/**
 * Toutes les réservations de l'hôtel (année 9.1) : liste filtrable par
 * statut et par recherche client/chambre → détail (actions : confirmer,
 * check-in, modifier, annuler, facturer) → création. En ligne, en appel
 * direct API comme le reste du desktop — le miroir hors-ligne n'existe
 * que sur mobile.
 */
export function EcranReservations({ client, onNaviguer, onFacturer }: EcranReservationsProps) {
  const [vue, setVue] = useState<Vue>({ id: "liste" });
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtreStatut, setFiltreStatut] = useState<StatutReservation | null>(null);
  const [recherche, setRecherche] = useState("");

  const charger = useCallback(() => {
    client
      .listerReservations()
      .then(setReservations)
      .catch((e: Error) => setErreur(e.message));
  }, [client]);

  useEffect(charger, [charger]);

  const liste = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return (reservations ?? []).filter(
      (r) =>
        (!filtreStatut || r.statut === filtreStatut) &&
        (!terme ||
          r.client.nom.toLowerCase().includes(terme) ||
          r.chambre.numero.toLowerCase().includes(terme))
    );
  }, [reservations, filtreStatut, recherche]);

  if (vue.id === "detail") {
    return (
      <EcranReservationDetail
        client={client}
        reservationId={vue.reservationId}
        onRetour={() => {
          setVue({ id: "liste" });
          charger();
        }}
        onFacturer={onFacturer}
      />
    );
  }

  if (vue.id === "nouvelle") {
    return (
      <EcranNouvelleReservation
        client={client}
        onRetour={() => setVue({ id: "liste" })}
        onCreee={(id) => {
          charger();
          setVue({ id: "detail", reservationId: id });
        }}
      />
    );
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Réservations</h1>
          <p className="hc-text-body page__sous-titre">
            {reservations ? `${liste.length} séjour${liste.length > 1 ? "s" : ""}` : "Chargement…"}
          </p>
        </div>
        <Button type="button" onClick={() => setVue({ id: "nouvelle" })}>
          <Plus size={18} aria-hidden="true" />
          Nouvelle réservation
        </Button>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      <div className="barre-filtres">
        <label className="champ-recherche">
          <Search size={18} aria-hidden="true" />
          <span className="visuellement-cache">Rechercher</span>
          <input
            type="search"
            placeholder="Rechercher un client ou une chambre…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </label>
        <div className="puces" role="group" aria-label="Filtrer par statut">
          {FILTRES.map((filtre) => (
            <button
              key={filtre.libelle}
              type="button"
              className="puce"
              aria-pressed={filtreStatut === filtre.id}
              onClick={() => setFiltreStatut(filtre.id)}
            >
              {filtre.libelle}
            </button>
          ))}
        </div>
      </div>

      {reservations === null && !erreur && <p className="hc-text-body texte-discret">Chargement des réservations…</p>}

      {reservations?.length === 0 && (
        <div className="etat-vide">
          <CalendarDays size={32} strokeWidth={1.5} aria-hidden="true" />
          <p className="hc-text-subheading">Aucune réservation enregistrée</p>
        </div>
      )}

      {liste.length > 0 && (
        <div className="carte-tableau" data-testid="tableau-reservations">
          <table className="tableau">
            <thead>
              <tr>
                <th>Client</th>
                <th>Chambre</th>
                <th>Arrivée</th>
                <th>Départ</th>
                <th>Nuits</th>
                <th>Acompte</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((r) => (
                <tr key={r.id} className="ligne-cliquable" onClick={() => setVue({ id: "detail", reservationId: r.id })}>
                  <td className="hc-text-body-strong">{r.client.nom}</td>
                  <td className="texte-discret">
                    {r.chambre.numero} · {r.chambre.type}
                  </td>
                  <td className="texte-discret">{dateCourte(r.dateArrivee)}</td>
                  <td className="texte-discret">{dateCourte(r.dateDepart)}</td>
                  <td className="texte-discret">{nombreDeNuits(r.dateArrivee, r.dateDepart)}</td>
                  <td className="hc-text-price">{formatMontant(r.acompte, r.chambre.devise)}</td>
                  <td>
                    <StatusBadge tone={TONE_STATUT[r.statut]} label={LABEL_STATUT[r.statut]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
