import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import type { ClientApi, JourneeReception } from "@hotel-chicago/api-client";
import { Devise } from "@hotel-chicago/types";
import { formatMontant } from "@hotel-chicago/ui";
import { BookOpenCheck, RefreshCw } from "lucide-react";
import { Button } from "@hotel-chicago/ui";

export interface EcranJourneeReceptionProps {
  client: ClientApi;
}

/**
 * Journal de la journée (GET /dashboard/journee-reception) : encaissements
 * par département et devise, arrivées/départs faits et restants, état du
 * parc — la « remise de poste » de fin de journée, heure de Lubumbashi.
 */
export function EcranJourneeReception({ client }: EcranJourneeReceptionProps) {
  const [journal, setJournal] = useState<JourneeReception | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    setEnCours(true);
    setErreur(null);
    try {
      setJournal(await client.journeeReception());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible de charger le journal.");
    } finally {
      setEnCours(false);
    }
  }, [client]);

  useEffect(() => {
    void charger();
  }, [charger]);

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Journal de la journée</h1>
          <p className="hc-text-body page__sous-titre">Remise de poste — encaissements et mouvements du jour</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void charger()} disabled={enCours}>
          <RefreshCw size={16} aria-hidden="true" />
          Actualiser
        </Button>
      </header>

      {erreur && <p role="alert" className="hc-text-body texte-erreur">{erreur}</p>}
      {!journal && !erreur && <p className="hc-text-body texte-discret">Chargement…</p>}

      {journal && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "var(--hc-space-4)" }}>
          <div className="carte-formulaire">
            <p className="hc-text-label texte-discret">Encaissements du jour</p>
            <div className="parametres-ligne">
              <span className="hc-text-body">Chambres ({journal.recette.chambres.nombreFactures} facture{journal.recette.chambres.nombreFactures > 1 ? "s" : ""})</span>
              <span className="hc-text-price">
                {formatMontant(journal.recette.chambres.montantUSD, Devise.USD)}
                {journal.recette.chambres.montantCDF > 0 ? ` + ${formatMontant(journal.recette.chambres.montantCDF, Devise.CDF)}` : ""}
              </span>
            </div>
            <div className="parametres-ligne">
              <span className="hc-text-body">Cafétéria ({journal.recette.cafeteria.nombreVentes} vente{journal.recette.cafeteria.nombreVentes > 1 ? "s" : ""})</span>
              <span className="hc-text-price">
                {formatMontant(journal.recette.cafeteria.montantUSD, Devise.USD)}
                {journal.recette.cafeteria.montantCDF > 0 ? ` + ${formatMontant(journal.recette.cafeteria.montantCDF, Devise.CDF)}` : ""}
              </span>
            </div>
            <div className="parametres-ligne" style={{ borderTop: "1px solid var(--hc-color-border, #e5e5e5)", paddingTop: "var(--hc-space-2)" }}>
              <span className="hc-text-body-strong">Total</span>
              <span className="hc-text-price">
                {formatMontant(journal.recette.total.montantUSD, Devise.USD)}
                {journal.recette.total.montantCDF > 0 ? ` + ${formatMontant(journal.recette.total.montantCDF, Devise.CDF)}` : ""}
              </span>
            </div>
          </div>

          <div className="carte-formulaire">
            <p className="hc-text-label texte-discret">
              Arrivées · {journal.arrivees.effectuees.length} faite{journal.arrivees.effectuees.length > 1 ? "s" : ""} ·{" "}
              {journal.arrivees.restantes.length} restante{journal.arrivees.restantes.length > 1 ? "s" : ""}
            </p>
            {journal.arrivees.restantes.length === 0 ? (
              <p className="hc-text-body texte-discret">Toutes les arrivées du jour sont installées.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "var(--hc-space-4)" }}>
                {journal.arrivees.restantes.map((r, i) => (
                  <li key={i} className="hc-text-body">Ch. {r.chambre.numero} · {r.client.nom}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="carte-formulaire">
            <p className="hc-text-label texte-discret">
              Départs · {journal.departs.effectues.length} fait{journal.departs.effectues.length > 1 ? "s" : ""} ·{" "}
              {journal.departs.restants.length} restant{journal.departs.restants.length > 1 ? "s" : ""}
            </p>
            {journal.departs.restants.length === 0 ? (
              <p className="hc-text-body texte-discret">Tous les départs du jour sont soldés.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "var(--hc-space-4)" }}>
                {journal.departs.restants.map((r, i) => (
                  <li key={i} className="hc-text-body">Ch. {r.chambre.numero} · {r.client.nom}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="carte-formulaire">
            <p className="hc-text-label texte-discret">Parc de chambres · {journal.chambres.tauxOccupationPourcent}% occupé</p>
            <div className="parametres-ligne"><span className="hc-text-body">Libres</span><span className="hc-text-body-strong">{journal.chambres.libres}</span></div>
            <div className="parametres-ligne"><span className="hc-text-body">Occupées</span><span className="hc-text-body-strong">{journal.chambres.occupees}</span></div>
            <div className="parametres-ligne"><span className="hc-text-body">Réservées</span><span className="hc-text-body-strong">{journal.chambres.reservees}</span></div>
            <div className="parametres-ligne"><span className="hc-text-body">En nettoyage</span><span className="hc-text-body-strong">{journal.chambres.enNettoyage}</span></div>
            <div className="parametres-ligne">
              <span className="hc-text-body">Comptes cafétéria ouverts</span>
              <span className="hc-text-body-strong">{journal.comptesCafeteriaOuverts}</span>
            </div>
          </div>

          <div className="carte-formulaire" style={{ display: "flex", alignItems: "center", gap: "var(--hc-space-3)" }}>
            <BookOpenCheck size={32} strokeWidth={1.5} aria-hidden="true" />
            <p className="hc-text-body texte-discret" style={{ margin: 0 }}>
              À utiliser en fin de journée pour la remise de poste : la recette réceptionniste ne compte que ses
              propres encaissements ; le patron voit le total de l'hôtel.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
