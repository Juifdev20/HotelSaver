import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { Reservation } from "@hotel-chicago/types";
import { Button, StatusBadge, formatMontant } from "@hotel-chicago/ui";
import { ArrowLeftRight } from "lucide-react";
import type { IdPage } from "../navigation";
import { LABEL_STATUT, TONE_STATUT, dateCourte } from "./EcranReservations";

export interface EcranArriveesDepartsProps {
  client: ClientApi;
  onNaviguer: (page: IdPage) => void;
  onFacturer: (reservationId: string) => void;
  /** Faux : lecture seule pour un patron dont l'hôtel n'a pas activé « le patron peut aussi opérer ». */
  peutOperer?: boolean;
}

function memeJour(iso: string, jour: Date): boolean {
  const d = new Date(iso);
  const debut = new Date(jour.getFullYear(), jour.getMonth(), jour.getDate());
  const fin = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + 1);
  return d >= debut && d < fin;
}

/**
 * « Arrivées et départs » du jour — le poste d'accueil du matin : qui
 * arrive (EN_ATTENTE à confirmer + CONFIRMEE à enregistrer), qui part
 * (EN_COURS à facturer/check-out). Les actions passent par les mêmes
 * endpoints transactionnels que le détail de réservation.
 */
export function EcranArriveesDeparts({ client, onFacturer, peutOperer = true }: EcranArriveesDepartsProps) {
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(() => {
    client
      .listerReservations()
      .then(setReservations)
      .catch((e: Error) => setErreur(e.message));
  }, [client]);

  useEffect(charger, [charger]);

  const aujourdhui = new Date();
  const arrivees = useMemo(
    () =>
      (reservations ?? []).filter(
        (r) => (r.statut === "EN_ATTENTE" || r.statut === "CONFIRMEE") && memeJour(r.dateArrivee, aujourdhui)
      ),
    [reservations, aujourdhui]
  );
  const departs = useMemo(
    () => (reservations ?? []).filter((r) => r.statut === "EN_COURS" && memeJour(r.dateDepart, aujourdhui)),
    [reservations, aujourdhui]
  );
  const presents = useMemo(() => (reservations ?? []).filter((r) => r.statut === "EN_COURS"), [reservations]);

  async function action(nom: string, f: () => Promise<unknown>) {
    setEnCours(nom);
    setErreur(null);
    try {
      await f();
      charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(null);
    }
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Arrivées et départs</h1>
          <p className="hc-text-body page__sous-titre">
            {arrivees.length} arrivée{arrivees.length > 1 ? "s" : ""} · {departs.length} départ
            {departs.length > 1 ? "s" : ""} · {presents.length} client{presents.length > 1 ? "s" : ""} présent
            {presents.length > 1 ? "s" : ""}
          </p>
        </div>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      {reservations === null && !erreur && <p className="hc-text-body texte-discret">Chargement…</p>}

      {reservations && (
        <>
          <div className="carte-tableau">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Arrivées du jour</th>
                  <th>Chambre</th>
                  <th>Départ prévu</th>
                  <th>Statut</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {arrivees.map((r) => (
                  <tr key={r.id}>
                    <td className="hc-text-body-strong">
                      {r.client.nom}
                      {r.origine === "SITE_PUBLIC" && <span className="badge-bientot" style={{ marginLeft: 8 }}>site public</span>}
                    </td>
                    <td className="texte-discret">{r.chambre.numero}</td>
                    <td className="texte-discret">{dateCourte(r.dateDepart)}</td>
                    <td>
                      <StatusBadge tone={TONE_STATUT[r.statut]} label={LABEL_STATUT[r.statut]} />
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {peutOperer && r.statut === "EN_ATTENTE" && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={enCours !== null}
                          onClick={() => void action(`confirmer-${r.id}`, () => client.confirmerReservation(r.id))}
                        >
                          {enCours === `confirmer-${r.id}` ? "…" : "Confirmer"}
                        </Button>
                      )}{" "}
                      {peutOperer && r.statut === "CONFIRMEE" && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={enCours !== null}
                          onClick={() => void action(`checkin-${r.id}`, () => client.checkIn(r.id))}
                        >
                          {enCours === `checkin-${r.id}` ? "…" : "Check-in"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {arrivees.length === 0 && (
                  <tr>
                    <td className="texte-discret" colSpan={5}>
                      Aucune arrivée attendue aujourd'hui.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="carte-tableau">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Départs du jour</th>
                  <th>Chambre</th>
                  <th>Arrivée</th>
                  <th>Acompte</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {departs.map((r) => (
                  <tr key={r.id}>
                    <td className="hc-text-body-strong">{r.client.nom}</td>
                    <td className="texte-discret">{r.chambre.numero}</td>
                    <td className="texte-discret">{dateCourte(r.dateArrivee)}</td>
                    <td className="hc-text-price">{formatMontant(r.acompte, r.chambre.devise)}</td>
                    <td>
                      {peutOperer && (
                        <Button type="button" size="sm" onClick={() => onFacturer(r.id)}>
                          Facturer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {departs.length === 0 && (
                  <tr>
                    <td className="texte-discret" colSpan={5}>
                      <ArrowLeftRight size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} aria-hidden="true" />
                      Aucun départ prévu aujourd'hui.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="carte-tableau">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Clients présents</th>
                  <th>Chambre</th>
                  <th>Départ prévu</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {presents.map((r) => (
                  <tr key={r.id}>
                    <td className="hc-text-body-strong">{r.client.nom}</td>
                    <td className="texte-discret">{r.chambre.numero}</td>
                    <td className="texte-discret">{dateCourte(r.dateDepart)}</td>
                    <td>
                      {peutOperer && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => onFacturer(r.id)}>
                          Facturer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {presents.length === 0 && (
                  <tr>
                    <td className="texte-discret" colSpan={4}>
                      Aucun client présent.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
