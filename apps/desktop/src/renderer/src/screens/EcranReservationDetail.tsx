import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { Reservation, ProfilConnecte } from "@hotel-chicago/types";
import { construireRecuFacture, enteteHotel } from "@hotel-chicago/receipts";
import { Button, formatMontant } from "@hotel-chicago/ui";
import { LABEL_STATUT, TONE_STATUT, dateCourte } from "./EcranReservations";
import { StatusBadge } from "@hotel-chicago/ui";

export interface EcranReservationDetailProps {
  client: ClientApi;
  reservationId: string;
  onRetour: () => void;
  onFacturer: (reservationId: string) => void;
  /** Pour la réimpression du reçu (séjour terminé). */
  utilisateur?: ProfilConnecte;
  interfaceImprimante?: string | null;
}

function nombreDeNuits(a: string, d: string): number {
  return Math.max(1, Math.round((new Date(d).getTime() - new Date(a).getTime()) / 86400000));
}

/** <input type="date"> attend AAAA-MM-JJ ; les dates viennent en ISO. */
function pourInputDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Fiche d'une réservation avec ses actions métier : les transitions de
 * statut (confirmer, check-in, annuler, facturer) sont des appels directs
 * — le desktop n'a pas de file hors-ligne. La modification de dates et
 * d'acompte passe par PATCH /reservations/:id.
 */
export function EcranReservationDetail({
  client,
  reservationId,
  onRetour,
  onFacturer,
  utilisateur,
  interfaceImprimante,
}: EcranReservationDetailProps) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [edition, setEdition] = useState(false);
  const [annulation, setAnnulation] = useState(false);
  const [motif, setMotif] = useState("");
  const [arrivee, setArrivee] = useState("");
  const [depart, setDepart] = useState("");
  const [acompteSaisi, setAcompteSaisi] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(() => {
    client
      .obtenirReservation(reservationId)
      .then(setReservation)
      .catch((e: Error) => setErreur(e.message));
  }, [client, reservationId]);

  useEffect(charger, [charger]);

  async function action(f: () => Promise<unknown>, messageSucces?: string) {
    setEnCours(true);
    setErreur(null);
    setMessage(null);
    try {
      await f();
      if (messageSucces) setMessage(messageSucces);
      charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  function enregistrerModification() {
    if (!reservation) return;
    const a = arrivee ? new Date(arrivee + "T12:00:00") : null;
    const d = depart ? new Date(depart + "T12:00:00") : null;
    if (a && d && a >= d) {
      setErreur("La date de départ doit être postérieure à la date d'arrivée.");
      return;
    }
    const acompte = acompteSaisi.trim() ? Number(acompteSaisi.replace(",", ".")) : undefined;
    if (acompte !== undefined && (Number.isNaN(acompte) || acompte < 0)) {
      setErreur("Acompte invalide.");
      return;
    }
    setEdition(false);
    void action(
      () =>
        client.modifierReservation(reservationId, {
          dateArrivee: a?.toISOString(),
          dateDepart: d?.toISOString(),
          acompte,
        }),
      "Réservation modifiée."
    );
  }

  function confirmerAnnulation() {
    if (!motif.trim()) {
      setErreur("Le motif d'annulation est obligatoire.");
      return;
    }
    setAnnulation(false);
    void action(() => client.annulerReservation(reservationId, motif.trim()));
    setMotif("");
  }

  async function reimprimerRecu() {
    if (!interfaceImprimante) {
      setMessage("Aucune imprimante configurée — Paramètres > Imprimante.");
      return;
    }
    await action(async () => {
      const [factures, ventes] = await Promise.all([
        client.listerFactures(reservationId),
        client.listerVentesCafeteria(reservationId),
      ]);
      const facture = factures[0];
      if (!facture) throw new Error("Aucune facture liée à ce séjour.");
      if (!reservation || !utilisateur) return;
      await window.hotelChicago.imprimer(
        interfaceImprimante,
        construireRecuFacture(facture, reservation, utilisateur.nom, ventes, enteteHotel(utilisateur))
      );
    }, "Reçu envoyé à l'imprimante.");
  }

  const statut = reservation?.statut;

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">
            {reservation ? reservation.client.nom : "Réservation"}
          </h1>
          {reservation && (
            <p className="hc-text-body page__sous-titre">
              Chambre {reservation.chambre.numero} · {reservation.chambre.type} ·{" "}
              {formatMontant(reservation.chambre.prixParNuit, reservation.chambre.devise)} / nuit
            </p>
          )}
        </div>
        <Button type="button" variant="secondary" onClick={onRetour}>
          Retour
        </Button>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}
      {message && (
        <p className="hc-text-body texte-succes" role="status">
          {message}
        </p>
      )}

      {!reservation && !erreur && <p className="hc-text-body texte-discret">Chargement…</p>}

      {reservation && statut && (
        <>
          <div className="carte-formulaire">
            <div className="parametres-ligne">
              <span className="hc-text-body-strong">Séjour</span>
              <StatusBadge tone={TONE_STATUT[statut]} label={LABEL_STATUT[statut]} />
            </div>
            <div className="parametres-ligne">
              <span className="hc-text-body">Dates</span>
              <span className="hc-text-body-strong">
                {dateCourte(reservation.dateArrivee)} → {dateCourte(reservation.dateDepart)} ·{" "}
                {nombreDeNuits(reservation.dateArrivee, reservation.dateDepart)} nuit
                {nombreDeNuits(reservation.dateArrivee, reservation.dateDepart) > 1 ? "s" : ""}
              </span>
            </div>
            <div className="parametres-ligne">
              <span className="hc-text-body">Acompte versé</span>
              <span className="hc-text-price">{formatMontant(reservation.acompte, reservation.chambre.devise)}</span>
            </div>
            {reservation.origine === "SITE_PUBLIC" && (
              <div className="parametres-ligne">
                <span className="hc-text-body">Origine</span>
                <span className="texte-discret">Demande du site public</span>
              </div>
            )}
            {statut === "ANNULEE" && reservation.motifAnnulation && (
              <div className="parametres-ligne">
                <span className="hc-text-body">Motif d'annulation</span>
                <span className="texte-discret">{reservation.motifAnnulation}</span>
              </div>
            )}
          </div>

          <div className="carte-formulaire">
            <p className="hc-text-label texte-discret">Client</p>
            <p className="hc-text-body">{reservation.client.nom}</p>
            {reservation.client.telephone && <p className="hc-text-body texte-discret">{reservation.client.telephone}</p>}
            {reservation.client.email && <p className="hc-text-body texte-discret">{reservation.client.email}</p>}
          </div>

          {!edition && (
            <div style={{ display: "flex", gap: "var(--hc-space-2)", flexWrap: "wrap" }}>
              {statut === "EN_ATTENTE" && (
                <Button type="button" onClick={() => void action(() => client.confirmerReservation(reservationId))} disabled={enCours}>
                  Confirmer la demande
                </Button>
              )}
              {statut === "CONFIRMEE" && (
                <Button type="button" onClick={() => void action(() => client.checkIn(reservationId))} disabled={enCours}>
                  Check-in
                </Button>
              )}
              {(statut === "CONFIRMEE" || statut === "EN_COURS") && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setArrivee(pourInputDate(reservation.dateArrivee));
                    setDepart(pourInputDate(reservation.dateDepart));
                    setAcompteSaisi(reservation.acompte !== "0" ? String(reservation.acompte) : "");
                    setErreur(null);
                    setEdition(true);
                  }}
                >
                  Modifier dates / acompte
                </Button>
              )}
              {statut === "EN_COURS" && (
                <Button type="button" onClick={() => onFacturer(reservationId)}>
                  Facturer et check-out
                </Button>
              )}
              {(statut === "EN_ATTENTE" || statut === "CONFIRMEE" || statut === "EN_COURS") && (
                <Button type="button" variant="danger" onClick={() => setAnnulation(true)} disabled={enCours}>
                  Annuler
                </Button>
              )}
              {statut === "TERMINEE" && (
                <Button type="button" variant="secondary" onClick={reimprimerRecu} disabled={enCours}>
                  {enCours ? "…" : "Réimprimer le reçu"}
                </Button>
              )}
            </div>
          )}

          {edition && (
            <div className="carte-formulaire formulaire">
              <p className="hc-text-label texte-discret">Modifier la réservation</p>
              <label className="hc-text-label" htmlFor="edit-arrivee">
                Arrivée
              </label>
              <input id="edit-arrivee" type="date" value={arrivee} onChange={(e) => setArrivee(e.target.value)} />
              <label className="hc-text-label" htmlFor="edit-depart">
                Départ
              </label>
              <input id="edit-depart" type="date" value={depart} onChange={(e) => setDepart(e.target.value)} />
              <label className="hc-text-label" htmlFor="edit-acompte">
                Acompte ({reservation.chambre.devise})
              </label>
              <input
                id="edit-acompte"
                type="text"
                inputMode="decimal"
                value={acompteSaisi}
                onChange={(e) => setAcompteSaisi(e.target.value)}
              />
              <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
                <Button type="button" onClick={enregistrerModification} disabled={enCours}>
                  Enregistrer
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEdition(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {annulation && (
            <div className="carte-formulaire formulaire">
              <p className="hc-text-label texte-discret">Annuler la réservation</p>
              <label className="hc-text-label" htmlFor="motif-annulation">
                Motif (obligatoire)
              </label>
              <input
                id="motif-annulation"
                type="text"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Ex. Le client ne se présente pas"
              />
              <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
                <Button type="button" variant="danger" onClick={confirmerAnnulation} disabled={enCours}>
                  Confirmer l'annulation
                </Button>
                <Button type="button" variant="secondary" onClick={() => setAnnulation(false)}>
                  Retour
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
