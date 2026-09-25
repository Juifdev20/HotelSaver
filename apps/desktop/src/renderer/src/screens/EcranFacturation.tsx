import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Devise, Facture, ModePaiement, Reservation, VenteCafeteria } from "@hotel-chicago/types";
import { Button, formatMontant } from "@hotel-chicago/ui";
import { CalendarCheck } from "lucide-react";

export interface EcranFacturationProps {
  client: ClientApi;
}

type Vue = { id: "liste" } | { id: "detail"; reservationId: string };

function nombreDeNuits(dateArrivee: string, dateDepart: string): number {
  const millisecondesParJour = 1000 * 60 * 60 * 24;
  return Math.max(1, Math.round((new Date(dateDepart).getTime() - new Date(dateArrivee).getTime()) / millisecondesParJour));
}

/** Même calcul que factures.service.ts::create — juste pour prévisualiser le
 * total avant d'envoyer, la vraie valeur facturée reste toujours celle
 * calculée côté serveur (voir aussi apps/mobile/src/ecrans/EcranFacturation.tsx). */
function calculerApercu(reservation: Reservation, ventesLiees: VenteCafeteria[]) {
  const nuits = nombreDeNuits(reservation.dateArrivee, reservation.dateDepart);
  const montantChambre = Number(reservation.chambre.prixParNuit) * nuits;
  const montantDu = Math.max(0, montantChambre - Number(reservation.acompte));
  const deviseChambre = reservation.chambre.devise;
  const cafeteriaUSD = ventesLiees.reduce((s, v) => s + Number(v.montantTotalUSD), 0);
  const cafeteriaCDF = ventesLiees.reduce((s, v) => s + Number(v.montantTotalCDF), 0);
  return {
    nuits,
    montantChambre,
    totalUSD: (deviseChambre === Devise.USD ? montantDu : 0) + cafeteriaUSD,
    totalCDF: (deviseChambre === Devise.CDF ? montantDu : 0) + cafeteriaCDF,
  };
}

/**
 * Facturer et check-out un séjour EN_COURS (section 11.2). Pas de sélecteur
 * de réservation séparé côté desktop (`reservations` reste "Bientôt" dans la
 * barre latérale, voir navigation.ts) : cet écran combine la liste et le
 * détail, comme `EcranFacturation.tsx` mobile. Pas de paiement croisé/monnaie
 * rendue ici, même simplification que Caisse mobile.
 */
function DetailFacturation({
  client,
  reservationId,
  onRetour,
}: {
  client: ClientApi;
  reservationId: string;
  onRetour: () => void;
}) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [ventesLiees, setVentesLiees] = useState<VenteCafeteria[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [modePaiement, setModePaiement] = useState<ModePaiement>(ModePaiement.CASH);
  const [enCours, setEnCours] = useState(false);
  const [factureCreee, setFactureCreee] = useState<Facture | null>(null);
  const [avertissementCheckOut, setAvertissementCheckOut] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    Promise.all([client.obtenirReservation(reservationId), client.listerVentesCafeteria(reservationId)])
      .then(([r, ventes]) => {
        if (annule) return;
        setReservation(r);
        setVentesLiees(ventes.filter((v) => !v.annuleLe));
      })
      .catch((e: Error) => {
        if (!annule) setErreur(e.message);
      });
    return () => {
      annule = true;
    };
  }, [client, reservationId]);

  const apercu = useMemo(() => (reservation ? calculerApercu(reservation, ventesLiees) : null), [reservation, ventesLiees]);

  async function facturerEtCheckOut() {
    setEnCours(true);
    setErreur(null);
    try {
      const facture = await client.creerFacture({ reservationId, modePaiement });
      setFactureCreee(facture);
      try {
        await client.checkOut(reservationId);
      } catch (e) {
        setAvertissementCheckOut(
          "Facture créée, mais le check-out a échoué : " +
            (e instanceof Error ? e.message : "erreur inconnue") +
            ". La chambre peut être passée en Nettoyage manuellement depuis Chambres."
        );
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  if (factureCreee) {
    return (
      <div className="page">
        <header className="page__entete">
          <div>
            <h1 className="hc-text-display-md page__titre">Facture créée</h1>
          </div>
        </header>
        <div className="carte-formulaire">
          <p className="hc-text-label texte-discret">{factureCreee.numeroRecu}</p>
          {Number(factureCreee.montantTotalUSD) > 0 && (
            <p className="hc-text-price">{formatMontant(factureCreee.montantTotalUSD, Devise.USD)}</p>
          )}
          {Number(factureCreee.montantTotalCDF) > 0 && (
            <p className="hc-text-price">{formatMontant(factureCreee.montantTotalCDF, Devise.CDF)}</p>
          )}
          {avertissementCheckOut && (
            <p role="alert" className="hc-text-body texte-erreur">
              {avertissementCheckOut}
            </p>
          )}
          <Button type="button" onClick={onRetour}>
            Retour aux séjours à facturer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Facturation</h1>
          {reservation && (
            <p className="hc-text-body page__sous-titre">
              Chambre {reservation.chambre.numero} — {reservation.client.nom}
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

      {!reservation && !erreur && <p className="hc-text-body texte-discret">Chargement…</p>}

      {reservation && apercu && (
        <>
          <div className="carte-formulaire">
            <p className="hc-text-label texte-discret">Séjour</p>
            <p className="hc-text-body">
              {apercu.nuits} nuit{apercu.nuits > 1 ? "s" : ""} — du{" "}
              {new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
                new Date(reservation.dateArrivee)
              )}{" "}
              au{" "}
              {new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
                new Date(reservation.dateDepart)
              )}
            </p>

            <div className="parametres-ligne">
              <span className="hc-text-body">Prix chambre</span>
              <span className="hc-text-price">{formatMontant(apercu.montantChambre, reservation.chambre.devise)}</span>
            </div>
            {Number(reservation.acompte) > 0 && (
              <div className="parametres-ligne">
                <span className="hc-text-body">Acompte versé</span>
                <span className="hc-text-price">-{formatMontant(reservation.acompte, reservation.chambre.devise)}</span>
              </div>
            )}
            {ventesLiees.map((v) => (
              <div className="parametres-ligne" key={v.id}>
                <span className="hc-text-body">Reçu {v.numeroRecu}</span>
                <span className="hc-text-price">
                  {Number(v.montantTotalUSD) > 0 ? formatMontant(v.montantTotalUSD, Devise.USD) : formatMontant(v.montantTotalCDF, Devise.CDF)}
                </span>
              </div>
            ))}
          </div>

          <div className="carte-formulaire">
            <p className="hc-text-label texte-discret">Total à payer</p>
            {apercu.totalUSD > 0 && <p className="hc-text-price">{formatMontant(apercu.totalUSD, Devise.USD)}</p>}
            {apercu.totalCDF > 0 && <p className="hc-text-price">{formatMontant(apercu.totalCDF, Devise.CDF)}</p>}
            {apercu.totalUSD === 0 && apercu.totalCDF === 0 && <p className="hc-text-price">0</p>}

            <p className="hc-text-label texte-discret" style={{ marginTop: "var(--hc-space-3)" }}>
              Mode de paiement
            </p>
            <div className="puces" role="group" aria-label="Mode de paiement">
              {[ModePaiement.CASH, ModePaiement.MOBILE_MONEY].map((m) => (
                <button
                  key={m}
                  type="button"
                  className="puce"
                  aria-pressed={modePaiement === m}
                  onClick={() => setModePaiement(m)}
                >
                  {m === ModePaiement.CASH ? "Espèces" : "Mobile money"}
                </button>
              ))}
            </div>

            <Button type="button" onClick={facturerEtCheckOut} disabled={enCours} style={{ marginTop: "var(--hc-space-3)" }}>
              {enCours ? "…" : "Facturer et check-out"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function EcranFacturation({ client }: EcranFacturationProps) {
  const [vue, setVue] = useState<Vue>({ id: "liste" });
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function charger() {
    client
      .listerReservations({ statut: "EN_COURS" })
      .then((liste) => setReservations(liste.filter((r) => r.facture === null)))
      .catch((e: Error) => setErreur(e.message));
  }

  useEffect(charger, [client]);

  if (vue.id === "detail") {
    return (
      <DetailFacturation
        client={client}
        reservationId={vue.reservationId}
        onRetour={() => {
          setVue({ id: "liste" });
          charger();
        }}
      />
    );
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Facturation</h1>
          <p className="hc-text-body page__sous-titre">Séjours en cours à facturer et check-out.</p>
        </div>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      {reservations === null && !erreur && <p className="hc-text-body texte-discret">Chargement…</p>}

      {reservations?.length === 0 && (
        <div className="etat-vide">
          <CalendarCheck size={32} strokeWidth={1.5} aria-hidden="true" />
          <p className="hc-text-subheading">Aucun séjour en cours à facturer</p>
        </div>
      )}

      {reservations && reservations.length > 0 && (
        <div className="carte-tableau" data-testid="tableau-facturation">
          <table className="tableau">
            <thead>
              <tr>
                <th>Chambre</th>
                <th>Client</th>
                <th>Nuits</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.id}>
                  <td className="hc-text-body-strong">{r.chambre.numero}</td>
                  <td className="texte-discret">{r.client.nom}</td>
                  <td className="texte-discret">{nombreDeNuits(r.dateArrivee, r.dateDepart)}</td>
                  <td>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setVue({ id: "detail", reservationId: r.id })}>
                      Facturer
                    </Button>
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
