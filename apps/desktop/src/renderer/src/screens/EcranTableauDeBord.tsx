import * as React from "react";
import { useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import {
  Devise,
  Occupation,
  Produit,
  RecetteDuJour,
  Role,
  ProfilConnecte,
  VentesRecentes,
} from "@hotel-chicago/types";
import { DashboardStat, Donut, formatMontant } from "@hotel-chicago/ui";
import {
  Banknote,
  BedDouble,
  Building2,
  Calendar,
  CircleCheck,
  Clock,
  Coffee,
  CreditCard,
  Package,
  ReceiptText,
  Sparkles,
  UserRound,
  Wallet,
} from "lucide-react";
import type { IdPage } from "../navigation";
// Photo temporaire (libre de droits, Unsplash) en attendant une vraie photo de
// l'hôtel fournie par le client — voir DECISIONS.md. À remplacer telle quelle
// (même chemin) une fois la photo réelle disponible.
import heroChambre from "../assets/hero-chambre.jpg";

export interface EcranTableauDeBordProps {
  client: ClientApi;
  utilisateur: ProfilConnecte;
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
      // Les données déjà affichées sont conservées : une erreur de rechargement ne vide pas le bloc.
      .catch((erreur: Error) => !annule && setEtat((precedent) => ({ donnee: precedent.donnee, erreur: erreur.message })));
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return etat;
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

function fusionnerActivite(donnees: VentesRecentes | null, limite: number): EvenementActivite[] {
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
  return [...factures, ...ventes].sort((a, b) => b.cle - a.cle).slice(0, limite);
}

/** Affiché quand le patron n'a pas défini de slogan pour son hôtel. */
const SLOGAN_PAR_DEFAUT = "Gestion simple. Séjour exceptionnel.";

const REPARTITION_LIMITE_INITIALE = 6;
const REPARTITION_LIMITE_ETENDUE = 20;

export function EcranTableauDeBord({ client, utilisateur, onNaviguer }: EcranTableauDeBordProps) {
  const voitChambres = utilisateur.role !== Role.CAFETARIA;
  const voitStock = utilisateur.role !== Role.RECEPTIONNISTE;
  const [limiteActivite, setLimiteActivite] = useState(REPARTITION_LIMITE_INITIALE);

  const recette = useDonnee<RecetteDuJour>(() => client.recetteDuJour(), [client]);
  const occupation = useDonnee<Occupation>(voitChambres ? () => client.occupation() : null, [client, voitChambres]);
  const stockBas = useDonnee<Produit[]>(voitStock ? () => client.stockBas() : null, [client, voitStock]);
  const activite = useDonnee<VentesRecentes>(() => client.ventesRecentes(limiteActivite), [client, limiteActivite]);

  const r = recette.donnee;
  const o = occupation.donnee;
  const evenements = fusionnerActivite(activite.donnee, limiteActivite);

  return (
    <div className="page">
      <section
        className="hero"
        aria-label="Bienvenue"
        style={{
          backgroundImage: `linear-gradient(120deg, rgba(15, 39, 66, 0.88) 0%, rgba(10, 26, 46, 0.82) 55%, rgba(11, 58, 115, 0.75) 100%), url(${heroChambre})`,
        }}
      >
        {/* Desktop : message de bienvenue + horloge empilée à droite. */}
        <div className="hero__desktop">
          <div className="hero__contenu">
            <p className="hero__salutation">Bienvenue</p>
            <h1 className="hero__titre">{utilisateur.hotelNom}</h1>
            <p className="hero__soustitre">{utilisateur.hotelSlogan ?? SLOGAN_PAR_DEFAUT}</p>
          </div>
          <div className="hero__horloge">
            <span className="hero__horloge-ligne">
              <Calendar size={15} aria-hidden="true" />
              {dateDuJourLongue()}
            </span>
            <span className="hero__horloge-ligne hero__heure">
              <Clock size={18} aria-hidden="true" />
              {heureCourante()}
            </span>
          </div>
        </div>

        {/* Fenêtre étroite : la barre latérale (qui porte la marque) est
            masquée, donc la marque reparaît ici — cf. maquette mobile. */}
        <div className="hero__mobile">
          <div className="hero__marque-mobile">
            <span className="hero__logo-mobile" aria-hidden="true">
              <Building2 size={20} strokeWidth={2} />
            </span>
            <span className="hero__marque-mobile-textes">
              <h1 className="hero__nom-mobile">{utilisateur.hotelNom}</h1>
              <span className="hero__slogan-mobile" data-testid="hero-slogan-mobile">
                Confort · Élégance · Service
              </span>
            </span>
          </div>
          <div className="hero__horloge-mobile">
            <span className="hero__horloge-ligne">
              <Calendar size={14} aria-hidden="true" />
              {dateDuJourLongue()}
            </span>
            <span className="hero__horloge-ligne">
              <Clock size={14} aria-hidden="true" />
              {heureCourante()}
            </span>
          </div>
        </div>
      </section>

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

      <div className="grille-trois-colonnes">
        {voitChambres && (
          <div className="carte-simple carte-simple--occupation">
            <h2 className="hc-text-subheading">Taux d'occupation</h2>
            {occupation.erreur && <p role="alert" className="hc-text-body texte-erreur">{occupation.erreur}</p>}
            <div className="occupation-compacte">
              <Donut
                taille={104}
                epaisseur={12}
                titre={
                  o
                    ? `Taux d'occupation : ${o.tauxOccupationPourcent} %. ${o.occupees} occupées, ${o.libres} libres, ${o.reservees} réservées, ${o.enNettoyage} en nettoyage.`
                    : "Taux d'occupation en cours de chargement"
                }
                segments={[
                  { valeur: o?.occupees ?? 0, couleur: "var(--hc-danger)" },
                  { valeur: o?.libres ?? 0, couleur: "var(--hc-success)" },
                  { valeur: o?.reservees ?? 0, couleur: "var(--hc-warning)" },
                  { valeur: o?.enNettoyage ?? 0, couleur: "var(--hc-purple)" },
                ]}
              >
                <span className="hc-text-heading">{o ? `${o.tauxOccupationPourcent}%` : "…"}</span>
              </Donut>
              <ul className="legende-occupation legende-occupation--verticale">
                <li>
                  <button type="button" className="legende-occupation__ligne" onClick={() => onNaviguer("chambres")}>
                    <span className="legende-occupation__pastille" aria-hidden="true" style={{ backgroundColor: "var(--hc-danger)" }} />
                    <span className="hc-text-caption">Occupées</span>
                    <span className="hc-text-body-strong">{o?.occupees ?? "…"}</span>
                  </button>
                </li>
                <li>
                  <button type="button" className="legende-occupation__ligne" onClick={() => onNaviguer("chambres")}>
                    <span className="legende-occupation__pastille" aria-hidden="true" style={{ backgroundColor: "var(--hc-success)" }} />
                    <span className="hc-text-caption">Libres</span>
                    <span className="hc-text-body-strong">{o?.libres ?? "…"}</span>
                  </button>
                </li>
                <li>
                  <button type="button" className="legende-occupation__ligne" onClick={() => onNaviguer("chambres")}>
                    <span className="legende-occupation__pastille" aria-hidden="true" style={{ backgroundColor: "var(--hc-warning)" }} />
                    <span className="hc-text-caption">Réservées</span>
                    <span className="hc-text-body-strong">{o?.reservees ?? "…"}</span>
                  </button>
                </li>
              </ul>
            </div>
            <p className="hc-text-caption texte-discret">{o ? `${o.occupees} sur ${o.total} chambre` : "chargement…"}</p>
          </div>
        )}

        {voitChambres && (
          <div className="carte-simple">
            <h2 className="hc-text-subheading">Répartition des chambres</h2>
            <div className="repartition-grille">
              <button type="button" className="repartition-case" onClick={() => onNaviguer("chambres")}>
                <span className="repartition-case__icone repartition-case__icone--success">
                  <BedDouble size={16} aria-hidden="true" />
                </span>
                <span className="repartition-case__texte">
                  <span className="hc-text-caption texte-discret">Libres</span>
                  <span className="hc-text-body-strong">{o?.libres ?? "…"}</span>
                </span>
              </button>
              <button type="button" className="repartition-case" onClick={() => onNaviguer("chambres")}>
                <span className="repartition-case__icone repartition-case__icone--danger">
                  <UserRound size={16} aria-hidden="true" />
                </span>
                <span className="repartition-case__texte">
                  <span className="hc-text-caption texte-discret">Occupées</span>
                  <span className="hc-text-body-strong">{o?.occupees ?? "…"}</span>
                </span>
              </button>
              <button type="button" className="repartition-case" onClick={() => onNaviguer("chambres")}>
                <span className="repartition-case__icone repartition-case__icone--warning">
                  <Calendar size={16} aria-hidden="true" />
                </span>
                <span className="repartition-case__texte">
                  <span className="hc-text-caption texte-discret">Réservées</span>
                  <span className="hc-text-body-strong">{o?.reservees ?? "…"}</span>
                </span>
              </button>
              <button type="button" className="repartition-case" onClick={() => onNaviguer("chambres")}>
                <span className="repartition-case__icone repartition-case__icone--purple">
                  <Sparkles size={16} aria-hidden="true" />
                </span>
                <span className="repartition-case__texte">
                  <span className="hc-text-caption texte-discret">Nettoyage</span>
                  <span className="hc-text-body-strong">{o?.enNettoyage ?? "…"}</span>
                </span>
              </button>
            </div>
          </div>
        )}

        {voitStock && (
          <div className="carte-simple">
            <h2 className="hc-text-subheading">Stock bas</h2>
            {stockBas.erreur && <p role="alert" className="hc-text-body texte-erreur">{stockBas.erreur}</p>}
            {!stockBas.donnee && !stockBas.erreur && (
              <p className="hc-text-body texte-discret">Chargement du stock…</p>
            )}
            {stockBas.donnee?.length === 0 && (
              <div className="carte-simple__vide">
                <Package size={26} strokeWidth={1.5} aria-hidden="true" className="texte-discret" />
                <p className="hc-text-body texte-discret">Aucun produit sous son seuil d'alerte.</p>
              </div>
            )}
            {stockBas.donnee && stockBas.donnee.length > 0 && (
              <ul className="liste-simple">
                {stockBas.donnee.slice(0, 3).map((produit) => (
                  <li key={produit.id} className="liste-simple__ligne">
                    <span className="hc-text-body-strong">{produit.nom}</span>
                    <span className="hc-text-price">{Number(produit.stockActuel)} restant</span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="lien-voir-plus" onClick={() => onNaviguer("stock")}>
              Voir le stock →
            </button>
          </div>
        )}
      </div>

      <section className="carte-simple" aria-labelledby="titre-activite">
        <div className="carte-simple__entete">
          <p id="titre-activite" className="hc-text-subheading">
            Activité récente
          </p>
          {evenements.length >= limiteActivite && limiteActivite === REPARTITION_LIMITE_INITIALE && (
            <button type="button" className="lien-voir-plus" onClick={() => setLimiteActivite(REPARTITION_LIMITE_ETENDUE)}>
              Voir tout →
            </button>
          )}
        </div>
        {activite.erreur && <p role="alert" className="hc-text-body texte-erreur">{activite.erreur}</p>}
        {!activite.donnee && !activite.erreur && <p className="hc-text-body texte-discret">Chargement de l'activité…</p>}
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
                  <span className={`badge-etat ${evenement.annule ? "badge-etat--danger" : "badge-etat--success"}`}>
                    <CircleCheck size={12} aria-hidden="true" />
                    {evenement.annule ? "Annulée" : "Confirmée"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
