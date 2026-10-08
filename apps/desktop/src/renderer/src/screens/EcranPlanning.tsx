import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { Chambre, Reservation, StatutReservation } from "@hotel-chicago/types";


export interface EcranPlanningProps {
  client: ClientApi;
  /** Cellule vide : nouvelle réservation pré-remplie. */
  onNouvelleReservation: (chambreId: string, dateArrivee: string) => void;
  /** Barre existante : détail de la réservation. */
  onOuvrirReservation: (reservationId: string) => void;
}

const NB_JOURS = 14;

const FOND_STATUT: Record<StatutReservation, string> = {
  EN_ATTENTE: "var(--hc-color-warning-soft, #fef0c7)",
  CONFIRMEE: "var(--hc-color-info-soft, #d1e0ff)",
  EN_COURS: "var(--hc-color-success-soft, #d1fadf)",
  TERMINEE: "var(--hc-color-neutral-soft, #e5e5e5)",
  ANNULEE: "var(--hc-color-danger-soft, #fee4e2)",
};

const TEXTE_STATUT: Record<StatutReservation, string> = {
  EN_ATTENTE: "var(--hc-color-warning, #b54708)",
  CONFIRMEE: "var(--hc-color-info, #175cd3)",
  EN_COURS: "var(--hc-color-success, #067647)",
  TERMINEE: "var(--hc-color-neutral, #6b6b6b)",
  ANNULEE: "var(--hc-color-danger, #b42318)",
};

const STATUTS_VISIBLES = new Set<StatutReservation>(["EN_ATTENTE", "CONFIRMEE", "EN_COURS"]);

function aujourdhuiAAAMMMDD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ajouterJours(input: string, n: number): string {
  const d = new Date(input + "T12:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Planning visuel du parc : une ligne par chambre, 14 jours à partir
 * d'aujourd'hui. Les barres colorées suivent le statut de la réservation ;
 * une cellule vide ouvre le formulaire pré-rempli. En ligne (appels API
 * directs — le desktop n'a pas de miroir hors-ligne).
 */
export function EcranPlanning({ client, onNouvelleReservation, onOuvrirReservation }: EcranPlanningProps) {
  const [chambres, setChambres] = useState<Chambre[] | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const debut = aujourdhuiAAAMMMDD();
  const fin = ajouterJours(debut, NB_JOURS);

  const charger = useCallback(() => {
    Promise.all([
      client.listerChambres(),
      client.listerReservations({ du: new Date(debut + "T00:00:00").toISOString(), au: new Date(fin + "T00:00:00").toISOString() }),
    ])
      .then(([c, r]) => {
        setChambres(c);
        setReservations(r);
      })
      .catch((e: Error) => setErreur(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  useEffect(charger, [charger]);

  const jours = useMemo(() => Array.from({ length: NB_JOURS }, (_, i) => ajouterJours(debut, i)), [debut]);

  // La chambre est occupée le jour J si arrivee <= J < depart (le jour du
  // départ elle est libérée — le client part le matin).
  const reservationSur = useCallback(
    (chambreId: string, jour: string) =>
      reservations.find(
        (r) => r.chambreId === chambreId && r.dateArrivee.slice(0, 10) <= jour && r.dateDepart.slice(0, 10) > jour
      ),
    [reservations]
  );

  if (erreur) {
    return <p role="alert" className="hc-text-body texte-erreur">{erreur}</p>;
  }
  if (!chambres) {
    return <p className="hc-text-body texte-discret">Chargement du planning…</p>;
  }

  return (
    <div className="carte-tableau" style={{ overflowX: "auto" }}>
      <table className="tableau tableau-planning">
        <thead>
          <tr>
            <th style={{ position: "sticky", left: 0, background: "var(--hc-color-surface, #fff)", zIndex: 1 }}>Chambre</th>
            {jours.map((j) => (
              <th key={j} style={{ minWidth: 44, textAlign: "center", fontWeight: 600 }}>
                {new Date(j + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short" })}{" "}
                <span
                  style={
                    j === debut
                      ? {
                          display: "inline-flex",
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "var(--hc-color-primary, #1d4ed8)",
                          color: "#fff",
                        }
                      : undefined
                  }
                >
                  {new Date(j + "T12:00:00").getDate()}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chambres.map((chambre) => (
            <tr key={chambre.id}>
              <td
                className="hc-text-body-strong"
                style={{ position: "sticky", left: 0, background: "var(--hc-color-surface, #fff)", zIndex: 1, whiteSpace: "nowrap" }}
              >
                {chambre.numero} <span className="texte-discret">{chambre.type}</span>
              </td>
              {jours.map((jour) => {
                const r = reservationSur(chambre.id, jour);
                return r ? (
                  <td
                    key={jour}
                    className="cellule-planning"
                    style={{ background: FOND_STATUT[r.statut], cursor: "pointer" }}
                    title={`${r.client.nom} — ${r.statut}`}
                    onClick={() => onOuvrirReservation(r.id)}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, color: TEXTE_STATUT[r.statut], display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {jour === r.dateArrivee.slice(0, 10) ? r.client.nom.split(" ")[0] : ""}
                    </span>
                  </td>
                ) : (
                  <td
                    key={jour}
                    className="cellule-planning"
                    style={{ cursor: "pointer" }}
                    title={`Réserver ${chambre.numero} le ${jour.split("-").reverse().join("/")}`}
                    onClick={() => onNouvelleReservation(chambre.id, jour)}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hc-text-caption texte-discret" style={{ marginTop: "var(--hc-space-2)" }}>
        Barre colorée = réservation (cliquer pour le détail) · cellule vide = créer une réservation pré-remplie.
      </p>
    </div>
  );
}
