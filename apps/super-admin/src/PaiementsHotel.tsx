import * as React from "react";
import { useEffect, useId, useState } from "react";
import { Button, useDialogue } from "@hotel-chicago/ui";
import type { PaiementLicenceSuperAdmin } from "@hotel-chicago/api-client";

const LIBELLE_METHODE: Record<string, string> = {
  VIREMENT: "Virement",
  MOBILE_MONEY: "Mobile Money",
  ESPECES: "Espèces",
  AUTRE: "Autre",
};

const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const montant = (p: PaiementLicenceSuperAdmin) =>
  `${p.montant.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${p.devise === "USD" ? "$" : "FC"}`;

export interface PaiementsHotelProps {
  hotelNom: string;
  charger: () => Promise<PaiementLicenceSuperAdmin[]>;
  /** Annule un paiement saisi à la main ; renvoie la liste à jour, ou lève une erreur lisible. */
  annuler: (paiementId: string, motif: string) => Promise<PaiementLicenceSuperAdmin[]>;
  onFermer: () => void;
}

/**
 * Paiements d'un hôtel (17/10/2026) : la trace complète, annulés compris. Une saisie manuelle erronée ou de test s'annule avec un motif
 * obligatoire — jamais effacée, elle ne compte plus pour la validité ni l'historique du patron. Un paiement en ligne (Mobile Money
 * réellement reçu) n'a pas de bouton « Annuler ».
 */
export function PaiementsHotel({ hotelNom, charger, annuler, onFermer }: PaiementsHotelProps) {
  const idTitre = useId();
  const idMotif = useId();
  const ref = useDialogue<HTMLDivElement>({ onEchap: onFermer });
  const [paiements, setPaiements] = useState<PaiementLicenceSuperAdmin[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aAnnuler, setAAnnuler] = useState<PaiementLicenceSuperAdmin | null>(null);
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    charger()
      .then(setPaiements)
      .catch((e: Error) => setErreur(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmerAnnulation() {
    if (!aAnnuler) return;
    if (motif.trim().length < 5) return setErreur("Indiquez le motif de l'annulation (5 caractères au moins).");
    setEnCours(true);
    setErreur(null);
    try {
      setPaiements(await annuler(aAnnuler.id, motif.trim()));
      setAAnnuler(null);
      setMotif("");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Annulation impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fond-modale" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div ref={ref} className="carte paiements-hotel" role="dialog" aria-modal="true" aria-labelledby={idTitre}>
        <h2 id={idTitre} className="titre">
          Paiements — {hotelNom}
        </h2>
        <p className="sous-titre">Un paiement annulé reste visible ici mais ne compte plus pour la validité de l'abonnement.</p>

        {erreur && (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        )}
        {paiements === null && !erreur && <p>Chargement…</p>}
        {paiements?.length === 0 && <p>Aucun paiement enregistré pour cet hôtel.</p>}

        {paiements && paiements.length > 0 && (
          <ul className="paiements-hotel__liste">
            {paiements.map((p) => (
              <li key={p.id} className={p.annuleLe ? "paiements-hotel__ligne paiements-hotel__ligne--annule" : "paiements-hotel__ligne"}>
                <div className="paiements-hotel__infos">
                  <strong className="paiements-hotel__montant">{montant(p)}</strong>
                  <span>
                    {date(p.createdAt)} · {LIBELLE_METHODE[p.methode] ?? p.methode} · couvre jusqu'au {date(p.periodeCouverteJusquau)}
                  </span>
                  <span className="paiements-hotel__source">
                    {p.source === "EN_LIGNE" ? "Payé en ligne (ScanLinkPay)" : `Saisi à la main${p.enregistreParNom ? ` par ${p.enregistreParNom}` : ""}`}
                    {p.note ? ` — « ${p.note} »` : ""}
                  </span>
                  {p.annuleLe && (
                    <span className="paiements-hotel__motif">
                      Annulé le {date(p.annuleLe)} : {p.motifAnnulation}
                    </span>
                  )}
                </div>
                {p.annuleLe ? (
                  <span className="paiements-hotel__etiquette">Annulé</span>
                ) : p.source === "MANUEL" ? (
                  <Button variant="danger" size="sm" onClick={() => setAAnnuler(p)} aria-label={`Annuler le paiement de ${montant(p)} du ${date(p.createdAt)}`}>
                    Annuler ce paiement
                  </Button>
                ) : (
                  <span className="paiements-hotel__etiquette paiements-hotel__etiquette--ok">Reçu</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {aAnnuler && (
          <div className="paiements-hotel__confirmation">
            <h3>
              Annuler le paiement de {montant(aAnnuler)} du {date(aAnnuler.createdAt)} ?
            </h3>
            <p>Il ne comptera plus pour la validité de l'abonnement de {hotelNom} ; le statut de l'hôtel sera recalculé tout de suite.</p>
            <label className="label" htmlFor={idMotif}>
              Motif (obligatoire)
            </label>
            <input
              id={idMotif}
              className="champ"
              value={motif}
              maxLength={300}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Ex. saisie de test, erreur de montant…"
              autoFocus
            />
            <div className="paiements-hotel__actions">
              <Button variant="danger" onClick={() => void confirmerAnnulation()} disabled={enCours}>
                {enCours ? "Annulation…" : "Annuler le paiement"}
              </Button>
              <Button variant="secondary" onClick={() => setAAnnuler(null)} disabled={enCours}>
                Garder
              </Button>
            </div>
          </div>
        )}

        <Button variant="secondary" onClick={onFermer} style={{ marginTop: 16 }}>
          Fermer
        </Button>
      </div>
    </div>
  );
}
