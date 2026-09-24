import * as React from "react";
import { useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import {
  Devise,
  Occupation,
  Produit,
  RecetteDuJour,
  Role,
  UtilisateurAuthentifie,
  VentesRecentes,
} from "@hotel-chicago/types";
import { DashboardStat, Donut, formatMontant } from "@hotel-chicago/ui";
import {
  Banknote,
  BedDouble,
  Building2,
  CircleCheck,
  Coffee,
  CreditCard,
  Package,
  ReceiptText,
  Wallet,
} from "lucide-react";
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

function dateDuJourLongue(): string {
  const texte = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
    new Date()
  );
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

function heureCourante(): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function heureRelative(iso: string): string {
  const date = new Date(iso);
  const aujourdHui = new Date().toDateString() === date.toDateString();
  const heure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
  if (aujourdHui) return `Aujourd'hui ${heure}`;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(
    date
  );
}

type EvenementActivite = {
  id: string;
  titre: string;
  description: string;
  quand: string;
  annule: boolean;
  cle: number;
};

function fusionnerActivite(donnees: VentesRecentes | null): EvenementActivite[] {
  if (!donnees) return [];
  const factures: EvenementActivite[] = donnees.factures.map((f) => ({
    id: f.id,
    titre: "Paiement enregistré",
    description: `Chambre ${f.reservation.chambre.numero} · ${f.reservation.client.nom} · Reçu ${f.numeroRecu}`,
    quand: f.createdAt,
    annule: f.annuleLe !== null,
    cle: new Date(f.createdAt).getTime(),
  }));
  const ventes: EvenementActivite[] = donnees.ventesCafeteria.map((v) => ({
    id: v.id,
    titre: "Vente cafétaria",
    description: `Reçu ${v.numeroRecu}`,
    quand: v.createdAt,
    annule: v.annuleLe !== null,
    cle: new Date(v.createdAt).getTime(),
  }));
  return [...factures, ...ventes].sort((a, b) => b.cle - a.cle).slice(0, 6);
}

export function EcranTableauDeBord({ client, utilisateur, onNaviguer }: EcranTableauDeBordProps) {
  const voitChambres = utilisateur.role !== Role.CAFETARIA;
  const voitStock = utilisateur.role !== Role.RECEPTIONNISTE;

  const recette = useDonnee<RecetteDuJour>(() => client.recetteDuJour(), [client]);
  const occupation = useDonnee<Occupation>(voitChambres ? () => client.occupation() : null, [client, voitChambres]);
  const stockBas = useDonnee<Produit[]>(voitStock ? () => client.stockBas() : null, [client, voitStock]);
  const activite = useDonnee<VentesRecentes>(() => client.ventesRecentes(), [client]);

  const r = recette.donnee;
  const o = occupation.donnee;
  const evenements = fusionnerActivite(activite.donnee);

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

      <section className="hero" aria-label="Bienvenue">
        <div className="hero__motif" aria-hidden="true">
          <Building2 size={180} strokeWidth={1} />
        </div>
        <div className="hero__contenu">
          <p className="hero__salutation">Bienvenue 👋</p>
          <h2 className="hero__titre">Hôtel Chicago</h2>
          <p className="hero__soustitre">Gestion simple. Séjour exceptionnel.</p>
        </div>
        <div className="hero__horloge">
          <span className="hc-text-body-strong">{dateDuJourLongue()}</span>
          <span className="hc-text-display-md hero__heure">{heureCourante()}</span>
        </div>
      </section>

      <section className="page__bloc" aria-labelledby="titre-recette">
        <h2 id="titre-recette" className="hc-text-subheading">
          Recette du jour
        </h2>
        {recette.erreur && <p role="alert" className="hc-text-body texte-erreur">{recette.erreur}</p>}
        <div className="grille-stats">
          {/* USD et CDF jamais additionnés (section 9.4) : deux cartes distinctes. */}
          <DashboardStat
            icone={<Wallet size={20} aria-hidden="true" />}
            tone="info"
            libelle="En dollars"
            valeur={r ? formatMontant(r.total.montantUSD, Devise.USD) : "…"}
            precision={utilisateur.role === Role.PATRON ? "Chambres et cafétaria" : "Vos encaissements"}
          />
          <DashboardStat
            icone={<Banknote size={20} aria-hidden="true" />}
            tone="success"
            libelle="En francs"
            valeur={r ? formatMontant(r.total.montantCDF, Devise.CDF) : "…"}
            precision={utilisateur.role === Role.PATRON ? "Chambres et cafétaria" : "Vos encaissements"}
          />
          {r?.chambres && (
            <DashboardStat
              icone={<BedDouble size={20} aria-hidden="true" />}
              tone="info"
              libelle="Dont chambres"
              valeur={formatMontant(r.chambres.montantUSD, Devise.USD)}
              precision={formatMontant(r.chambres.montantCDF, Devise.CDF)}
            />
          )}
          {r?.cafeteria && (
            <DashboardStat
              icone={<Coffee size={20} aria-hidden="true" />}
              tone="purple"
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
          <div className="carte-occupation">
            <div className="carte-occupation__donut">
              <Donut
                segments={[
                  { valeur: o?.occupees ?? 0, couleur: "var(--hc-danger)" },
                  { valeur: o?.libres ?? 0, couleur: "var(--hc-success)" },
                  { valeur: o?.reservees ?? 0, couleur: "var(--hc-warning)" },
                  { valeur: o?.enNettoyage ?? 0, couleur: "var(--hc-purple)" },
                ]}
              >
                <span className="hc-text-display-md">{o ? `${o.tauxOccupationPourcent}%` : "…"}</span>
                <span className="hc-text-caption texte-discret">
                  {o ? `${o.occupees} sur ${o.total}` : "chargement…"}
                </span>
              </Donut>
              <p className="hc-text-label texte-discret">Taux d'occupation</p>
            </div>
            <ul className="legende-occupation">
              <li>
                <button type="button" className="legende-occupation__ligne" onClick={() => onNaviguer("chambres")}>
                  <span className="legende-occupation__pastille" style={{ backgroundColor: "var(--hc-danger)" }} />
                  <span className="hc-text-body">Occupées</span>
                  <span className="hc-text-body-strong">{o?.occupees ?? "…"}</span>
                </button>
              </li>
              <li>
                <button type="button" className="legende-occupation__ligne" onClick={() => onNaviguer("chambres")}>
                  <span className="legende-occupation__pastille" style={{ backgroundColor: "var(--hc-success)" }} />
                  <span className="hc-text-body">Libres</span>
                  <span className="hc-text-body-strong">{o?.libres ?? "…"}</span>
                </button>
              </li>
              <li>
                <button type="button" className="legende-occupation__ligne" onClick={() => onNaviguer("chambres")}>
                  <span className="legende-occupation__pastille" style={{ backgroundColor: "var(--hc-warning)" }} />
                  <span className="hc-text-body">Réservées</span>
                  <span className="hc-text-body-strong">{o?.reservees ?? "…"}</span>
                </button>
              </li>
              <li>
                <button type="button" className="legende-occupation__ligne" onClick={() => onNaviguer("chambres")}>
                  <span className="legende-occupation__pastille" style={{ backgroundColor: "var(--hc-purple)" }} />
                  <span className="hc-text-body">Nettoyage</span>
                  <span className="hc-text-body-strong">{o?.enNettoyage ?? "…"}</span>
                </button>
              </li>
            </ul>
          </div>
        </section>
      )}

      <div className="grille-deux-colonnes">
        {voitStock && (
          <section className="page__bloc" aria-labelledby="titre-stock">
            <h2 id="titre-stock" className="hc-text-subheading">
              Stock bas
            </h2>
            <div className="carte-simple">
              {stockBas.erreur && <p role="alert" className="hc-text-body texte-erreur">{stockBas.erreur}</p>}
              {!stockBas.donnee && !stockBas.erreur && (
                <p className="hc-text-body texte-discret">Chargement du stock…</p>
              )}
              {stockBas.donnee?.length === 0 && (
                <div className="carte-simple__vide">
                  <Package size={28} strokeWidth={1.5} aria-hidden="true" className="texte-discret" />
                  <p className="hc-text-body texte-discret">Aucun produit sous son seuil d'alerte.</p>
                </div>
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
              <button type="button" className="lien-voir-plus" onClick={() => onNaviguer("stock")}>
                Voir le stock →
              </button>
            </div>
          </section>
        )}

        <section className="page__bloc" aria-labelledby="titre-activite">
          <h2 id="titre-activite" className="hc-text-subheading">
            Activité récente
          </h2>
          <div className="carte-simple">
            {activite.erreur && <p role="alert" className="hc-text-body texte-erreur">{activite.erreur}</p>}
            {!activite.donnee && !activite.erreur && (
              <p className="hc-text-body texte-discret">Chargement de l'activité…</p>
            )}
            {activite.donnee && evenements.length === 0 && (
              <div className="carte-simple__vide">
                <ReceiptText size={28} strokeWidth={1.5} aria-hidden="true" className="texte-discret" />
                <p className="hc-text-body texte-discret">Aucune activité aujourd'hui.</p>
              </div>
            )}
            {evenements.length > 0 && (
              <ul className="activite-liste">
                {evenements.map((evenement) => (
                  <li key={evenement.id} className="activite-item">
                    <span className={`activite-item__icone${evenement.annule ? " activite-item__icone--annule" : ""}`}>
                      <CreditCard size={17} aria-hidden="true" />
                    </span>
                    <span className="activite-item__texte">
                      <span className="hc-text-body-strong">{evenement.titre}</span>
                      <span className="hc-text-caption texte-discret">{evenement.description}</span>
                    </span>
                    <span className="activite-item__droite">
                      <span className="hc-text-caption texte-discret">{heureRelative(evenement.quand)}</span>
                      <span
                        className={`badge-etat ${evenement.annule ? "badge-etat--danger" : "badge-etat--success"}`}
                      >
                        <CircleCheck size={12} aria-hidden="true" />
                        {evenement.annule ? "Annulée" : "Confirmée"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
