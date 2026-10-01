import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { CompteCafeteria, Devise, Role, StatutCompte, ProfilConnecte, VenteCafeteria } from "@hotel-chicago/types";
import { construireRecuVente, enteteHotel } from "@hotel-chicago/receipts";
import { Button, formatMontant, StatusBadge } from "@hotel-chicago/ui";
import { ClipboardList } from "lucide-react";

export interface EcranComptesOuvertsProps {
  client: ClientApi;
  utilisateur: ProfilConnecte;
  interfaceImprimante: string | null;
  onOuvrirCompte: (compteId: string) => void;
}

function totalCompte(compte: CompteCafeteria): { usd: number; cdf: number } {
  let usd = 0;
  let cdf = 0;
  for (const sousCompte of compte.sousComptes) {
    for (const ligne of sousCompte.lignes) {
      const montant = Number(ligne.prixUnitaire) * Number(ligne.quantite);
      if (ligne.devise === Devise.USD) usd += montant;
      else cdf += montant;
    }
  }
  return { usd, cdf };
}

/** Journal des ventes encaissées (Phase 16, retour terrain) : retrouver le
 * détail d'un règlement cafétaria (montant remis, devise, taux, monnaie
 * rendue) et le réimprimer — pendant de JournalRecus dans
 * EcranFacturation.tsx côté réception. Annulation avec motif, PATRON
 * uniquement (matrice 9.3, POST /cafeteria/ventes/:id/annuler). */
function JournalVentes({
  client,
  utilisateur,
  interfaceImprimante,
}: {
  client: ClientApi;
  utilisateur: ProfilConnecte;
  interfaceImprimante: string | null;
}) {
  const [ventes, setVentes] = useState<VenteCafeteria[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [detailDe, setDetailDe] = useState<string | null>(null);
  const [annulationDe, setAnnulationDe] = useState<string | null>(null);
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(() => {
    client
      .listerVentesCafeteria()
      .then((liste) =>
        setVentes([...liste].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 50))
      )
      .catch((e: Error) => setErreur(e.message));
  }, [client]);

  useEffect(charger, [charger]);

  async function reimprimer(vente: VenteCafeteria) {
    if (!interfaceImprimante) {
      setMessage("Aucune imprimante configurée — Paramètres > Imprimante.");
      return;
    }
    setEnCours(vente.id);
    setMessage(null);
    setErreur(null);
    try {
      const compte = await client.obtenirCompteCafeteria(vente.compteId);
      await window.hotelChicago.imprimer(interfaceImprimante, construireRecuVente(vente, compte, utilisateur.nom, enteteHotel(utilisateur)));
      setMessage(`Reçu ${vente.numeroRecu} envoyé à l'imprimante.`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'impression.");
    } finally {
      setEnCours(null);
    }
  }

  async function annuler(vente: VenteCafeteria) {
    if (!motif.trim()) {
      setErreur("Le motif d'annulation est obligatoire.");
      return;
    }
    setEnCours(vente.id);
    setErreur(null);
    try {
      await client.annulerVenteCafeteria(vente.id, motif.trim());
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
        Journal des ventes encaissées
      </p>
      {message && (
        <p className="hc-text-body texte-succes" role="status" style={{ padding: "0 var(--hc-space-3)" }}>
          {message}
        </p>
      )}
      {erreur && (
        <p className="hc-text-body texte-erreur" role="alert" style={{ padding: "0 var(--hc-space-3)" }}>
          {erreur}
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
          {(ventes ?? []).map((v) => (
            <React.Fragment key={v.id}>
              <tr>
                <td className="hc-text-body-strong">{v.numeroRecu}</td>
                <td className="texte-discret">
                  {new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
                    new Date(v.createdAt)
                  )}
                </td>
                <td className="hc-text-price">
                  {Number(v.montantTotalUSD) > 0 && formatMontant(v.montantTotalUSD, Devise.USD)}
                  {Number(v.montantTotalUSD) > 0 && Number(v.montantTotalCDF) > 0 && " + "}
                  {Number(v.montantTotalCDF) > 0 && formatMontant(v.montantTotalCDF, Devise.CDF)}
                </td>
                <td className="texte-discret">{v.modePaiement === "CASH" ? "Espèces" : v.modePaiement}</td>
                <td>
                  <StatusBadge
                    tone={v.annuleLe ? "danger" : "success"}
                    label={v.annuleLe ? "Annulé" : "Réglé"}
                  />
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setDetailDe(detailDe === v.id ? null : v.id)}
                  >
                    Détail
                  </Button>{" "}
                  <Button type="button" variant="secondary" size="sm" disabled={enCours !== null} onClick={() => void reimprimer(v)}>
                    {enCours === v.id ? "…" : "Réimprimer"}
                  </Button>{" "}
                  {estPatron && !v.annuleLe && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={enCours !== null}
                      onClick={() => {
                        setAnnulationDe(v.id);
                        setMotif("");
                        setErreur(null);
                      }}
                    >
                      Annuler
                    </Button>
                  )}
                </td>
              </tr>
              {detailDe === v.id && (
                <tr>
                  <td colSpan={6} className="texte-discret">
                    <div style={{ padding: "var(--hc-space-2) var(--hc-space-3)" }}>
                      {v.deviseRegleeParClient && v.montantRegleParClient && (
                        <div>Montant remis : {formatMontant(v.montantRegleParClient, v.deviseRegleeParClient)}</div>
                      )}
                      {v.tauxChangeApplique && <div>Taux appliqué : 1 $ = {formatMontant(v.tauxChangeApplique, Devise.CDF)}</div>}
                      {v.deviseMonnaieRendue && v.montantMonnaieRendue && (
                        <div>Monnaie rendue : {formatMontant(v.montantMonnaieRendue, v.deviseMonnaieRendue)}</div>
                      )}
                      {v.reservationLieeId && <div>Lié à un séjour</div>}
                      {v.motifAnnulation && <div>Motif : {v.motifAnnulation}</div>}
                      {!v.deviseRegleeParClient && !v.tauxChangeApplique && !v.motifAnnulation && <div>Paiement au comptant, sans détail saisi.</div>}
                    </div>
                  </td>
                </tr>
              )}
              {annulationDe === v.id && (
                <tr>
                  <td colSpan={6}>
                    <div style={{ display: "flex", gap: "var(--hc-space-2)", alignItems: "center", padding: "var(--hc-space-2) 0" }}>
                      <input
                        value={motif}
                        onChange={(e) => setMotif(e.target.value)}
                        placeholder="Motif d'annulation (obligatoire)"
                        style={{ flex: 1 }}
                        aria-label="Motif d'annulation"
                      />
                      <Button type="button" size="sm" variant="danger" disabled={enCours !== null} onClick={() => void annuler(v)}>
                        Confirmer
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => setAnnulationDe(null)}>
                        Garder
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
          {ventes?.length === 0 && (
            <tr>
              <td colSpan={6} className="texte-discret">
                Aucune vente encaissée pour le moment.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Équivalent desktop de apps/mobile/src/ecrans/EcranComptesOuverts.tsx — en
 * ligne directe (pas de miroir), même logique, plus le journal des ventes
 * (réimpression/détail/annulation) en dessous des comptes ouverts. */
export function EcranComptesOuverts({ client, utilisateur, interfaceImprimante, onOuvrirCompte }: EcranComptesOuvertsProps) {
  const [comptes, setComptes] = useState<CompteCafeteria[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function charger() {
    client
      .listerComptesCafeteria(StatutCompte.OUVERT)
      .then(setComptes)
      .catch((e: Error) => setErreur(e.message));
  }

  useEffect(charger, [client]);

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Comptes ouverts</h1>
          <p className="hc-text-body page__sous-titre">
            {comptes ? `${comptes.length} compte${comptes.length > 1 ? "s" : ""} ouvert${comptes.length > 1 ? "s" : ""}` : "Chargement…"}
          </p>
        </div>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      {comptes?.length === 0 && (
        <div className="etat-vide">
          <ClipboardList size={32} strokeWidth={1.5} aria-hidden="true" />
          <p className="hc-text-subheading">Aucun compte ouvert pour le moment</p>
        </div>
      )}

      {comptes && comptes.length > 0 && (
        <div className="carte-tableau" data-testid="tableau-comptes-ouverts">
          <table className="tableau">
            <thead>
              <tr>
                <th>Table / nom</th>
                <th>Personnes</th>
                <th>Total</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {comptes.map((c) => {
                const total = totalCompte(c);
                return (
                  <tr key={c.id}>
                    <td className="hc-text-body-strong">{c.tableOuNom}</td>
                    <td className="texte-discret">{c.sousComptes.length}</td>
                    <td className="texte-discret">
                      {total.usd === 0 && total.cdf === 0
                        ? "—"
                        : [total.usd > 0 ? formatMontant(total.usd, Devise.USD) : null, total.cdf > 0 ? formatMontant(total.cdf, Devise.CDF) : null]
                            .filter(Boolean)
                            .join(" + ")}
                    </td>
                    <td>
                      <Button type="button" variant="secondary" size="sm" onClick={() => onOuvrirCompte(c.id)}>
                        Ouvrir
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <JournalVentes client={client} utilisateur={utilisateur} interfaceImprimante={interfaceImprimante} />
    </div>
  );
}
