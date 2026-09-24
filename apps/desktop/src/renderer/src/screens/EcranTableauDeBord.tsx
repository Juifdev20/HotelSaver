import * as React from "react";
import { useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Devise, Occupation, Produit, RecetteDuJour, Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { DashboardStat, formatMontant } from "@hotel-chicago/ui";
import type { IdPage } from "../navigation";

export interface EcranTableauDeBordProps {
  client: ClientApi;
  utilisateur: UtilisateurAuthentifie;
  onNaviguer: (page: IdPage) => void;
}

/** Charge une donnée du tableau de bord ; une erreur n'efface pas les autres blocs. */
function useDonnee<T>(charger: (() => Promise<T>) | null, deps: unknown[]) {
  const [etat, setEtat] = useState<{ donnee: T | null; erreur: string | null }>({ donnee: null, erreur: null });
  useEffect(() => {
    if (!charger) return;
    let annule = false;
    charger()
      .then((donnee) => !annule && setEtat({ donnee, erreur: null }))
      .catch((erreur: Error) => !annule && setEtat({ donnee: null, erreur: erreur.message }));
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return etat;
}

function salutation(): string {
  return new Date().getHours() < 18 ? "Bonjour" : "Bonsoir";
}

export function EcranTableauDeBord({ client, utilisateur, onNaviguer }: EcranTableauDeBordProps) {
  const voitChambres = utilisateur.role !== Role.CAFETARIA;
  const voitStock = utilisateur.role !== Role.RECEPTIONNISTE;

  const recette = useDonnee<RecetteDuJour>(() => client.recetteDuJour(), [client]);
  const occupation = useDonnee<Occupation>(voitChambres ? () => client.occupation() : null, [client, voitChambres]);
  const stockBas = useDonnee<Produit[]>(voitStock ? () => client.stockBas() : null, [client, voitStock]);

  const r = recette.donnee;
  const o = occupation.donnee;

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Tableau de bord</h1>
          <p className="hc-text-body page__sous-titre">
            {salutation()}, {utilisateur.nom}. Voici la situation d'aujourd'hui.
          </p>
        </div>
      </header>

      <section className="page__bloc" aria-labelledby="titre-recette">
        <h2 id="titre-recette" className="hc-text-subheading">
          Recette du jour
        </h2>
        {recette.erreur && <p role="alert" className="hc-text-body texte-erreur">{recette.erreur}</p>}
        <div className="grille-stats">
          {/* USD et CDF jamais additionnés (section 9.4) : deux cartes distinctes. */}
          <DashboardStat
            libelle="En dollars"
            valeur={r ? formatMontant(r.total.montantUSD, Devise.USD) : "…"}
            precision={utilisateur.role === Role.PATRON ? "Chambres et cafétaria" : "Vos encaissements"}
          />
          <DashboardStat
            libelle="En francs"
            valeur={r ? formatMontant(r.total.montantCDF, Devise.CDF) : "…"}
            precision={utilisateur.role === Role.PATRON ? "Chambres et cafétaria" : "Vos encaissements"}
          />
          {utilisateur.role === Role.PATRON && r?.chambres && (
            <DashboardStat
              libelle="Dont chambres"
              valeur={formatMontant(r.chambres.montantUSD, Devise.USD)}
              precision={formatMontant(r.chambres.montantCDF, Devise.CDF)}
            />
          )}
          {utilisateur.role === Role.PATRON && r?.cafeteria && (
            <DashboardStat
              libelle="Dont cafétaria"
              valeur={formatMontant(r.cafeteria.montantUSD, Devise.USD)}
              precision={formatMontant(r.cafeteria.montantCDF, Devise.CDF)}
            />
          )}
        </div>
      </section>

      {voitChambres && (
        <section className="page__bloc" aria-labelledby="titre-occupation">
          <h2 id="titre-occupation" className="hc-text-subheading">
            Occupation des chambres
          </h2>
          {occupation.erreur && <p role="alert" className="hc-text-body texte-erreur">{occupation.erreur}</p>}
          <div className="grille-stats">
            <DashboardStat
              libelle="Taux d'occupation"
              valeur={o ? `${o.tauxOccupationPourcent} %` : "…"}
              precision={o ? `${o.occupees} sur ${o.total} chambre${o.total > 1 ? "s" : ""}` : undefined}
              onClick={() => onNaviguer("chambres")}
            />
            <DashboardStat libelle="Libres" tone="success" valeur={o?.libres ?? "…"} onClick={() => onNaviguer("chambres")} />
            <DashboardStat libelle="Occupées" tone="danger" valeur={o?.occupees ?? "…"} onClick={() => onNaviguer("chambres")} />
            <DashboardStat libelle="Réservées" tone="warning" valeur={o?.reservees ?? "…"} onClick={() => onNaviguer("chambres")} />
            <DashboardStat libelle="Nettoyage" tone="neutral" valeur={o?.enNettoyage ?? "…"} onClick={() => onNaviguer("chambres")} />
          </div>
        </section>
      )}

      {voitStock && (
        <section className="page__bloc" aria-labelledby="titre-stock">
          <h2 id="titre-stock" className="hc-text-subheading">
            Stock bas
          </h2>
          {stockBas.erreur && <p role="alert" className="hc-text-body texte-erreur">{stockBas.erreur}</p>}
          {stockBas.donnee?.length === 0 && (
            <p className="hc-text-body texte-discret">Aucun produit sous son seuil d'alerte.</p>
          )}
          {stockBas.donnee && stockBas.donnee.length > 0 && (
            <ul className="liste-simple">
              {stockBas.donnee.map((produit) => (
                <li key={produit.id} className="liste-simple__ligne">
                  <span className="hc-text-body-strong">{produit.nom}</span>
                  <span className="hc-text-price">
                    {Number(produit.stockActuel)} restant{Number(produit.stockActuel) > 1 ? "s" : ""} · seuil{" "}
                    {Number(produit.seuilAlerte)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
