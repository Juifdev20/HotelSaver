import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Devise, Facture, ModePaiement, Reservation, Role, ProfilConnecte, VenteCafeteria, peutOperer } from "@hotel-chicago/types";
import type { TauxChange } from "@hotel-chicago/api-client";
import { construireRecuFacture, enteteHotel } from "@hotel-chicago/receipts";
import { Button, formatMontant } from "@hotel-chicago/ui";
import { CalendarCheck } from "lucide-react";
import { lireMontant } from "@hotel-chicago/miroir-local";

export interface EcranFacturationProps {
  client: ClientApi;
  utilisateur: ProfilConnecte;
  /** Connexion imprimante configurée (Paramètres > Imprimante) — null tant
   * qu'aucune n'est réglée, le bouton d'impression le signale alors. */
  interfaceImprimante: string | null;
  /** Présent quand on arrive d'une autre page (Réservations, Arrivées et
   * départs) : ouvre directement le détail de cette réservation. */
  reservationInitiale?: string | null;
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
 * Facturer et check-out un séjour EN_COURS (section 11.2), paiement croisé
 * inclus (section 9.4) — même prévisualisation que l'écran mobile
 * (encaissement.util.ts fait foi côté serveur). Cet écran combine la liste
 * des séjours à facturer, le détail d'encaissement et le journal des reçus.
 */
function DetailFacturation({
  client,
  utilisateur,
  interfaceImprimante,
  reservationId,
  onRetour,
}: {
  client: ClientApi;
  utilisateur: ProfilConnecte;
  interfaceImprimante: string | null;
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
  const [enImpression, setEnImpression] = useState(false);
  const [messageImpression, setMessageImpression] = useState<string | null>(null);

  // Paiement croisé (section 9.4) : devise remise, montant remis, devise du rendu.
  const [taux, setTaux] = useState<TauxChange | null>(null);
  const [deviseReglee, setDeviseReglee] = useState<Devise>(Devise.USD);
  const [montantRegle, setMontantRegle] = useState("");
  const [deviseRendu, setDeviseRendu] = useState<Devise>(Devise.USD);

  useEffect(() => {
    let annule = false;
    Promise.all([client.obtenirReservation(reservationId), client.listerVentesCafeteria(reservationId), client.tauxActuel()])
      .then(([r, ventes, t]) => {
        if (annule) return;
        setReservation(r);
        setVentesLiees(ventes.filter((v) => !v.annuleLe));
        setTaux(t);
      })
      .catch((e: Error) => {
        if (!annule) setErreur(e.message);
      });
    return () => {
      annule = true;
    };
  }, [client, reservationId]);

  const apercu = useMemo(() => (reservation ? calculerApercu(reservation, ventesLiees) : null), [reservation, ventesLiees]);

  const factureMixte = apercu ? apercu.totalUSD > 0 && apercu.totalCDF > 0 : false;
  const deviseDue: Devise | null = apercu ? (apercu.totalUSD > 0 ? Devise.USD : apercu.totalCDF > 0 ? Devise.CDF : null) : null;
  const cdfParUsd = taux ? Number(taux.cdfParUsd) : undefined;
  const regleLu = montantRegle.trim() === "" ? null : lireMontant(montantRegle, deviseReglee, { max: 1_000_000_000 });
  const regle = regleLu && regleLu.ok ? regleLu.valeur : NaN;
  const detailSaisi = regleLu !== null && regleLu.ok;
  const erreurMontantRegle = regleLu && !regleLu.ok ? regleLu.message : null;

  /** Prévisualisation de la monnaie — même règles que
   * apps/api/src/factures/encaissement.util.ts (référence côté serveur). */
  const apercuMonnaie = useMemo(() => {
    if (!apercu || !deviseDue || !detailSaisi || factureMixte) return null;
    const du = deviseDue === Devise.USD ? apercu.totalUSD : apercu.totalCDF;
    const croise = deviseReglee !== deviseDue;
    if (croise && !cdfParUsd) return { statut: "taux-manquant" as const };
    const duReglee = croise ? (deviseDue === Devise.USD ? du * cdfParUsd! : du / cdfParUsd!) : du;
    const reste = regle - duReglee;
    if (reste < -0.005) return { statut: "insuffisant" as const, duReglee };
    const monnaieReglee = Math.max(0, reste);
    const monnaieRendue =
      deviseRendu === deviseReglee
        ? monnaieReglee
        : deviseReglee === Devise.USD
          ? monnaieReglee * cdfParUsd!
          : monnaieReglee / cdfParUsd!;
    return {
      statut: "ok" as const,
      monnaie: deviseRendu === Devise.CDF ? Math.round(monnaieRendue) : Math.round(monnaieRendue * 100) / 100,
      deviseMonnaie: deviseRendu,
    };
  }, [apercu, deviseDue, deviseReglee, deviseRendu, detailSaisi, regle, cdfParUsd, factureMixte]);

  const bloquerPaiement =
    erreurMontantRegle !== null || (detailSaisi && (apercuMonnaie?.statut === "insuffisant" || apercuMonnaie?.statut === "taux-manquant"));

  async function facturerEtCheckOut() {
    setEnCours(true);
    setErreur(null);
    try {
      const facture = await client.creerFacture({
        reservationId,
        modePaiement,
        ...(detailSaisi
          ? { deviseRegleeParClient: deviseReglee, montantRegleParClient: regle, deviseRenduChoisie: deviseRendu }
          : {}),
      });
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

  async function imprimerRecu() {
    if (!factureCreee || !reservation) return;
    if (!interfaceImprimante) {
      setMessageImpression("Aucune imprimante configurée — réglez-la depuis Paramètres > Imprimante.");
      return;
    }
    setEnImpression(true);
    setMessageImpression(null);
    try {
      await window.hotelChicago.imprimer(
        interfaceImprimante,
        construireRecuFacture(factureCreee, reservation, utilisateur.nom, ventesLiees, enteteHotel(utilisateur))
      );
      setMessageImpression("Reçu envoyé à l'imprimante.");
    } catch (e) {
      setMessageImpression(e instanceof Error ? e.message : "Échec de l'impression.");
    } finally {
      setEnImpression(false);
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
          {messageImpression && (
            <p className="hc-text-body" role="status">
              {messageImpression}
            </p>
          )}
          <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
            <Button type="button" variant="secondary" onClick={imprimerRecu} disabled={enImpression}>
              {enImpression ? "…" : "Imprimer le reçu"}
            </Button>
            <Button type="button" onClick={onRetour}>
              Retour aux séjours à facturer
            </Button>
          </div>
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

            {factureMixte && (
              <p className="hc-text-body" style={{ color: "var(--hc-warning)", marginTop: "var(--hc-space-3)" }}>
                Facture en deux devises : le règlement croisé n'est pas possible — encaisser les montants USD et CDF
                séparément.
              </p>
            )}

            {!factureMixte && deviseDue && (
              <div className="carte-formulaire" style={{ marginTop: "var(--hc-space-3)" }}>
                <p className="hc-text-label texte-discret">Détail du règlement (optionnel)</p>
                <div className="parametres-ligne">
                  <span className="hc-text-body">Devise remise par le client</span>
                  <div className="puces" role="group" aria-label="Devise remise">
                    {[Devise.USD, Devise.CDF].map((d) => (
                      <button
                        key={d}
                        type="button"
                        className="puce"
                        aria-pressed={deviseReglee === d}
                        onClick={() => setDeviseReglee(d)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                {deviseReglee !== deviseDue && (
                  <p className="hc-text-caption" style={{ color: "var(--hc-primary)" }}>
                    {taux
                      ? `Dû : ${formatMontant(
                          deviseDue === Devise.USD ? apercu.totalUSD * cdfParUsd! : apercu.totalCDF / cdfParUsd!,
                          deviseReglee
                        )} (1 $ = ${formatMontant(cdfParUsd!, Devise.CDF)})`
                      : "Aucun taux de change défini par le patron — paiement croisé impossible."}
                  </p>
                )}
                <label className="hc-text-label" htmlFor="montant-remis">
                  Montant remis
                </label>
                <input
                  id="montant-remis"
                  type="text"
                  inputMode="decimal"
                  value={montantRegle}
                  onChange={(e) => setMontantRegle(e.target.value)}
                  placeholder={deviseReglee === Devise.USD ? "Ex. 100.00" : "Ex. 280 000"}
                  aria-invalid={erreurMontantRegle !== null}
                  aria-describedby={erreurMontantRegle ? "montant-remis-erreur" : undefined}
                />
                {erreurMontantRegle && (
                  <p id="montant-remis-erreur" role="alert" className="hc-text-body">
                    {erreurMontantRegle}
                  </p>
                )}
                {detailSaisi && (
                  <div className="parametres-ligne">
                    <span className="hc-text-body">Rendre la monnaie en</span>
                    <div className="puces" role="group" aria-label="Devise du rendu">
                      {[Devise.USD, Devise.CDF].map((d) => (
                        <button
                          key={d}
                          type="button"
                          className="puce"
                          aria-pressed={deviseRendu === d}
                          onClick={() => setDeviseRendu(d)}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {apercuMonnaie?.statut === "insuffisant" && (
                  <p role="alert" className="hc-text-body texte-erreur">
                    Montant insuffisant : il faut {formatMontant(apercuMonnaie.duReglee, deviseReglee)}.
                  </p>
                )}
                {apercuMonnaie?.statut === "taux-manquant" && (
                  <p role="alert" className="hc-text-body texte-erreur">
                    Aucun taux de change défini par le patron.
                  </p>
                )}
                {apercuMonnaie?.statut === "ok" && (
                  <p className="hc-text-body-strong texte-succes">
                    Monnaie à rendre : {formatMontant(apercuMonnaie.monnaie, apercuMonnaie.deviseMonnaie)}
                  </p>
                )}
              </div>
            )}

            {peutOperer(utilisateur) ? (
              <Button
                type="button"
                onClick={facturerEtCheckOut}
                disabled={enCours || bloquerPaiement}
                style={{ marginTop: "var(--hc-space-3)" }}
              >
                {enCours ? "…" : "Facturer et check-out"}
              </Button>
            ) : (
              <p className="hc-text-caption texte-discret bandeau-lecture-seule" role="note">
                Lecture seule — la facturation est réservée au personnel de la réception.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Journal des reçus (section 11.2 / matrice 9.3) : toutes les factures de
 * l'hôtel, triées récent en premier — réimpression pour tout le monde à la
 * réception, annulation PATRON uniquement (Roles(PATRON) côté API). */
function JournalRecus({
  client,
  utilisateur,
  interfaceImprimante,
}: {
  client: ClientApi;
  utilisateur: ProfilConnecte;
  interfaceImprimante: string | null;
}) {
  const [factures, setFactures] = useState<Facture[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [annulationDe, setAnnulationDe] = useState<string | null>(null);
  const [detailDe, setDetailDe] = useState<string | null>(null);
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(() => {
    client
      .listerFactures()
      .then((liste) =>
        setFactures([...liste].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 50))
      )
      .catch((e: Error) => setErreur(e.message));
  }, [client]);

  useEffect(charger, [charger]);

  async function reimprimer(facture: Facture) {
    if (!interfaceImprimante) {
      setMessage("Aucune imprimante configurée — Paramètres > Imprimante.");
      return;
    }
    setEnCours(facture.id);
    setMessage(null);
    setErreur(null);
    try {
      const [reservation, ventes] = await Promise.all([
        client.obtenirReservation(facture.reservationId),
        client.listerVentesCafeteria(facture.reservationId),
      ]);
      await window.hotelChicago.imprimer(
        interfaceImprimante,
        construireRecuFacture(facture, reservation, utilisateur.nom, ventes, enteteHotel(utilisateur), { duplicata: true })
      );
      setMessage(`Reçu ${facture.numeroRecu} envoyé à l'imprimante.`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'impression.");
    } finally {
      setEnCours(null);
    }
  }

  async function annuler(facture: Facture) {
    if (!motif.trim()) {
      setErreur("Le motif d'annulation est obligatoire.");
      return;
    }
    setEnCours(facture.id);
    setErreur(null);
    try {
      await client.annulerFacture(facture.id, motif.trim());
      setAnnulationDe(null);
      setMotif("");
      charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(null);
    }
  }

  const estPatron = utilisateur.role === Role.PATRON;

  return (
    <div className="carte-tableau" style={{ marginTop: "var(--hc-space-4)" }}>
      <p className="hc-text-label texte-discret" style={{ padding: "var(--hc-space-3)" }}>
        Journal des reçus
      </p>
      {message && (
        <p className="hc-text-body texte-succes" role="status" style={{ padding: "0 var(--hc-space-3)" }}>
          {message}
        </p>
      )}
      <table className="tableau">
        <thead>
          <tr>
            <th>N° reçu</th>
            <th>Date</th>
            <th>Montant</th>
            <th>Mode</th>
            <th>État</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {(factures ?? []).map((f) => (
            <React.Fragment key={f.id}>
              <tr>
                <td className="hc-text-body-strong">{f.numeroRecu}</td>
                <td className="texte-discret">
                  {new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
                    new Date(f.createdAt)
                  )}
                </td>
                <td className="hc-text-price">
                  {Number(f.montantTotalUSD) > 0 && formatMontant(f.montantTotalUSD, Devise.USD)}
                  {Number(f.montantTotalUSD) > 0 && Number(f.montantTotalCDF) > 0 && " + "}
                  {Number(f.montantTotalCDF) > 0 && formatMontant(f.montantTotalCDF, Devise.CDF)}
                </td>
                <td className="texte-discret">{f.modePaiement === "CASH" ? "Espèces" : f.modePaiement}</td>
                <td className="texte-discret">{f.annuleLe ? `Annulé — ${f.motifAnnulation ?? ""}` : "Réglé"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setDetailDe(detailDe === f.id ? null : f.id)}
                  >
                    Détail
                  </Button>{" "}
                  <Button type="button" variant="secondary" size="sm" disabled={enCours !== null} onClick={() => void reimprimer(f)}>
                    {enCours === f.id ? "…" : "Réimprimer"}
                  </Button>{" "}
                  {estPatron && !f.annuleLe && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={enCours !== null}
                      onClick={() => {
                        setAnnulationDe(f.id);
                        setMotif("");
                        setErreur(null);
                      }}
                    >
                      Annuler
                    </Button>
                  )}
                </td>
              </tr>
              {detailDe === f.id && (
                <tr>
                  <td colSpan={6} className="texte-discret">
                    <div style={{ padding: "var(--hc-space-2) var(--hc-space-3)" }}>
                      {f.deviseRegleeParClient && f.montantRegleParClient && (
                        <div>Montant remis : {formatMontant(f.montantRegleParClient, f.deviseRegleeParClient)}</div>
                      )}
                      {f.tauxChangeApplique && <div>Taux appliqué : 1 $ = {formatMontant(f.tauxChangeApplique, Devise.CDF)}</div>}
                      {f.deviseMonnaieRendue && f.montantMonnaieRendue && (
                        <div>Monnaie rendue : {formatMontant(f.montantMonnaieRendue, f.deviseMonnaieRendue)}</div>
                      )}
                      {f.motifAnnulation && <div>Motif : {f.motifAnnulation}</div>}
                      {!f.deviseRegleeParClient && !f.tauxChangeApplique && !f.motifAnnulation && (
                        <div>Paiement au comptant, sans détail saisi.</div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {annulationDe === f.id && (
                <tr>
                  <td colSpan={6}>
                    <div style={{ display: "flex", gap: "var(--hc-space-2)", alignItems: "center" }}>
                      <input
                        type="text"
                        placeholder="Motif d'annulation (obligatoire)"
                        value={motif}
                        onChange={(e) => setMotif(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <Button type="button" variant="danger" size="sm" disabled={enCours !== null} onClick={() => void annuler(f)}>
                        Confirmer
                      </Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setAnnulationDe(null)}>
                        Fermer
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
          {factures && factures.length === 0 && (
            <tr>
              <td className="texte-discret" colSpan={6}>
                Aucun reçu pour le moment.
              </td>
            </tr>
          )}
          {factures === null && !erreur && (
            <tr>
              <td className="texte-discret" colSpan={6}>
                Chargement…
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur" style={{ padding: "var(--hc-space-3)" }}>
          {erreur}
        </p>
      )}
    </div>
  );
}

export function EcranFacturation({ client, utilisateur, interfaceImprimante, reservationInitiale }: EcranFacturationProps) {
  const [vue, setVue] = useState<Vue>(
    reservationInitiale ? { id: "detail", reservationId: reservationInitiale } : { id: "liste" }
  );
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
        utilisateur={utilisateur}
        interfaceImprimante={interfaceImprimante}
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
                    {peutOperer(utilisateur) && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => setVue({ id: "detail", reservationId: r.id })}>
                        Facturer
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <JournalRecus client={client} utilisateur={utilisateur} interfaceImprimante={interfaceImprimante} />
    </div>
  );
}
