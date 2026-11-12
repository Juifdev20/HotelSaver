import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { Chambre, Reservation, StatutReservation } from "@hotel-chicago/types";
import { Button, StatusBadge, StatusTone, formatMontant } from "@hotel-chicago/ui";
import { BedDouble, CalendarDays, Check, LogIn, LogOut, Search, Users } from "lucide-react";
import type { IdPage } from "../navigation";
import { EcranReservationDetail } from "./EcranReservationDetail";
import { EcranNouvelleReservation } from "./EcranNouvelleReservation";
import { EcranPlanning } from "./EcranPlanning";
import { BadgePayeEnLigne, useAcomptesEnLigne } from "./PayeEnLigne";
import { actionPourSejour, demandesSurChambrePrise, sejoursDuJour } from "@hotel-chicago/regles";
import type { ProposeActionSejour } from "@hotel-chicago/regles";
import { LigneSejour, nuitsDe } from "../sejours/LigneSejour";
import "../sejours/sejours.css";
import { useTri } from "../components/useTri";
import { usePagination } from "../components/Pagination";

export interface EcranReservationsProps {
  client: ClientApi;
  onNaviguer: (page: IdPage) => void;
  /** Ouvre l'écran Facturation directement sur ce séjour. */
  onFacturer: (reservationId: string, options?: { checkOut: boolean }) => void;
  /** Faux pour un patron dont l'hôtel n'a pas activé « le patron peut aussi opérer » : lecture seule. */
  peutOperer?: boolean;
  /** Ouvre directement la fiche de cette réservation (clic sur une notification). */
  reservationInitiale?: string | null;
  /** Ouvre directement l'enregistrement d'une arrivée (depuis une chambre libre) : chambre déjà choisie, client « déjà là ». */
  nouvelleInitiale?: { chambreId?: string } | null;
}

type Vue =
  | { id: "liste" }
  | { id: "detail"; reservationId: string }
  | { id: "nouvelle"; chambreInitialeId?: string; dateArriveeInitiale?: string; arriveeImmediate?: boolean };

type Onglet = "aujourdhui" | "avenir" | "encours" | "historique" | "planning";

const ONGLETS: { id: Onglet; libelle: string }[] = [
  { id: "aujourdhui", libelle: "Aujourd'hui" },
  { id: "avenir", libelle: "À venir" },
  { id: "encours", libelle: "En cours" },
  { id: "historique", libelle: "Historique" },
  { id: "planning", libelle: "Planning" },
];

const FORMAT_DATE_LONGUE = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lubumbashi" });

export const LABEL_STATUT: Record<StatutReservation, string> = {
  EN_ATTENTE: "En attente",
  CONFIRMEE: "Confirmée",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
  ANNULEE: "Annulée",
};

export const TONE_STATUT: Record<StatutReservation, StatusTone> = {
  EN_ATTENTE: "warning",
  CONFIRMEE: "info",
  EN_COURS: "success",
  TERMINEE: "neutral",
  ANNULEE: "danger",
};

export function dateCourte(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

/**
 * « Séjours » (11/11/2026) : ce qu'il y a à faire aujourd'hui (arrivées, départs, clients présents — un bouton par séjour), puis toutes les
 * réservations (à venir, en cours, historique, planning) et la fiche de chacune. Remplace « Réservations » et « Arrivées et départs ».
 * Lit toujours la base locale (miroir) : marche hors ligne ; les actions s'écrivent localement et partent à la reconnexion.
 */
export function EcranReservations({ client, onNaviguer, onFacturer, peutOperer = true, reservationInitiale = null, nouvelleInitiale = null }: EcranReservationsProps) {
  const [vue, setVue] = useState<Vue>(
    reservationInitiale
      ? { id: "detail", reservationId: reservationInitiale }
      : nouvelleInitiale
        ? { id: "nouvelle", chambreInitialeId: nouvelleInitiale.chambreId || undefined, arriveeImmediate: true }
        : { id: "liste" }
  );
  const [onglet, setOnglet] = useState<Onglet>("aujourdhui");
  const { parReservation: acomptes } = useAcomptesEnLigne(client);
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [chambres, setChambres] = useState<Chambre[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");

  const charger = useCallback(() => {
    client
      .listerReservations()
      .then(setReservations)
      .catch((e: Error) => setErreur(e.message));
    client
      .listerChambres()
      .then(setChambres)
      .catch(() => undefined);
  }, [client]);

  useEffect(charger, [charger]);

  const correspond = useCallback(
    (r: Reservation) => {
      const terme = recherche.trim().toLowerCase();
      return (
        !terme ||
        r.client.nom.toLowerCase().includes(terme) ||
        r.chambre.numero.toLowerCase().includes(terme) ||
        (r.client.telephone ?? "").replace(/\s/g, "").includes(terme.replace(/\s/g, ""))
      );
    },
    [recherche]
  );

  const jour = useMemo(() => sejoursDuJour(reservations ?? []), [reservations]);
  const chambresLibres = chambres.filter((c) => c.statut === "LIBRE").length;

  /** Réservations des onglets « À venir », « En cours », « Historique » (l'onglet « Aujourd'hui » a ses propres groupes). */
  const liste = useMemo(() => {
    const maintenant = Date.now();
    const finDuJour = new Date();
    finDuJour.setHours(23, 59, 59, 999);
    return (reservations ?? []).filter((r) => {
      if (!correspond(r)) return false;
      switch (onglet) {
        case "avenir":
          return (r.statut === "CONFIRMEE" || r.statut === "EN_ATTENTE") && new Date(r.dateArrivee).getTime() > Math.max(maintenant, finDuJour.getTime());
        case "encours":
          return r.statut === "EN_COURS";
        case "historique":
          return r.statut === "TERMINEE" || r.statut === "ANNULEE";
        default:
          return false;
      }
    });
  }, [reservations, onglet, correspond]);

  const { lignes: listeTriee, entete } = useTri(liste, {
    client: (r) => r.client.nom,
    chambre: (r) => r.chambre.numero,
    arrivee: (r) => r.dateArrivee,
    depart: (r) => r.dateDepart,
    nuits: (r) => nuitsDe(r),
    acompte: (r) => Number(r.acompte),
    statut: (r) => r.statut,
  });

  const { visibles: listeVisible, pied: piedListe } = usePagination(listeTriee);

  // Demandes en attente dont la chambre est DÉJÀ prise par un autre client : signalées en rouge.
  const demandesBloquees = useMemo(() => demandesSurChambrePrise(reservations ?? []), [reservations]);

  async function lancerAction(sejour: Reservation, action: ProposeActionSejour) {
    if (action.id === "facturer") {
      onFacturer(sejour.id, { checkOut: true });
      return;
    }
    setActionEnCours(sejour.id);
    setErreur(null);
    setInfo(null);
    try {
      if (action.id === "checkin") {
        await client.checkIn(sejour.id);
        const reste = Math.max(0, Number(sejour.chambre.prixParNuit) * nuitsDe(sejour) - Number(sejour.acompte));
        setInfo(
          reste > 0
            ? `${sejour.client.nom} est arrivé(e). Reste à payer : ${formatMontant(reste, sejour.chambre.devise)} — à encaisser depuis sa fiche ou au départ.`
            : `${sejour.client.nom} est arrivé(e). Le séjour est déjà payé.`
        );
      } else {
        await client.confirmerReservation(sejour.id);
        setInfo(`Réservation de ${sejour.client.nom} confirmée.`);
      }
      charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'action n'a pas pu être faite. Réessayez.");
    } finally {
      setActionEnCours(null);
    }
  }

  if (vue.id === "detail") {
    return (
      <EcranReservationDetail
        client={client}
        reservationId={vue.reservationId}
        onRetour={() => {
          setVue({ id: "liste" });
          charger();
        }}
        onFacturer={onFacturer}
        peutOperer={peutOperer}
      />
    );
  }

  if (vue.id === "nouvelle") {
    return (
      <EcranNouvelleReservation
        client={client}
        chambreInitialeId={vue.chambreInitialeId}
        dateArriveeInitiale={vue.dateArriveeInitiale}
        arriveeImmediateParDefaut={vue.arriveeImmediate === true}
        onRetour={() => setVue({ id: "liste" })}
        onCreee={(id) => {
          charger();
          setVue({ id: "detail", reservationId: id });
        }}
      />
    );
  }

  const groupe = (titre: string, items: Reservation[], genre: "arrivee" | "depart" | "present", vide: string) => {
    const visibles = items.filter(correspond);
    return (
      <section className="sejours-groupe" aria-label={titre} data-testid={`groupe-${genre}`}>
        <h2 className="sejours-groupe__titre">
          {titre} <span className="sejours-groupe__nombre">{visibles.length}</span>
        </h2>
        {visibles.length === 0 ? (
          <p className="sejours-groupe__vide">
            <Check size={18} aria-hidden="true" /> {vide}
          </p>
        ) : (
          <div role="table" aria-label={titre}>
            {visibles.map((r) => (
              <LigneSejour
                key={r.id}
                sejour={r}
                genre={genre}
                chambrePrise={demandesBloquees.has(r.id)}
                paiementsEnLigne={acomptes.get(r.id)}
                actionEnCours={actionEnCours === r.id}
                action={actionPourSejour(r, { operer: peutOperer, chambrePrise: demandesBloquees.has(r.id), departAujourdhui: genre === "depart" })}
                onOuvrir={() => setVue({ id: "detail", reservationId: r.id })}
                onAction={(a) => void lancerAction(r, a)}
              />
            ))}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Séjours</h1>
          <p className="hc-text-body page__sous-titre">{FORMAT_DATE_LONGUE.format(new Date()).replace(/^./, (c) => c.toUpperCase())}</p>
        </div>
        {peutOperer && (
          <div className="sejours-entete-actions">
            <Button type="button" variant="secondary" onClick={() => setVue({ id: "nouvelle" })}>
              <CalendarDays size={18} aria-hidden="true" />
              Nouvelle réservation
            </Button>
            <Button type="button" onClick={() => setVue({ id: "nouvelle", arriveeImmediate: true })}>
              <LogIn size={18} aria-hidden="true" />
              Enregistrer une arrivée
            </Button>
          </div>
        )}
      </header>
      {!peutOperer && (
        <p className="hc-text-caption texte-discret bandeau-lecture-seule" role="note">
          Lecture seule — cette opération est réservée au personnel (réception / caisse). Le réglage se trouve dans Réglages.
        </p>
      )}

      <div className="sejours-kpis" aria-label="Aujourd'hui en chiffres">
        {[
          { n: jour.arrivees.length, libelle: "Arrivées attendues", aide: "aujourd'hui", Icone: LogIn, fond: "var(--hc-blue-light)", couleur: "var(--hc-blue)" },
          { n: jour.departs.length, libelle: "Départs prévus", aide: "aujourd'hui", Icone: LogOut, fond: "var(--hc-warning-light)", couleur: "var(--hc-warning)" },
          { n: jour.presents.length, libelle: "Clients présents", aide: "dans l'hôtel", Icone: Users, fond: "var(--hc-success-light)", couleur: "var(--hc-success)" },
          { n: chambresLibres, libelle: "Chambres libres", aide: `sur ${chambres.length} en tout`, Icone: BedDouble, fond: "var(--hc-info-light)", couleur: "var(--hc-info)" },
        ].map((k) => (
          <div key={k.libelle} className="sejours-kpi">
            <span className="sejours-kpi__icone" style={{ background: k.fond, color: k.couleur }}>
              <k.Icone size={22} aria-hidden="true" />
            </span>
            <span>
              <span className="sejours-kpi__valeur">{k.n}</span>
              <span className="sejours-kpi__libelle">{k.libelle}</span>
              <span className="sejours-kpi__aide">{k.aide}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="sejours-onglets">
        <div className="sejours-onglets__liste" role="tablist" aria-label="Séjours">
          {ONGLETS.map((o) => (
            <button key={o.id} type="button" role="tab" className="sejours-onglet" aria-selected={onglet === o.id} onClick={() => setOnglet(o.id)}>
              {o.libelle}
            </button>
          ))}
        </div>
        {onglet !== "planning" && (
          <label className="champ-recherche">
            <Search size={18} aria-hidden="true" />
            <span className="visuellement-cache">Rechercher</span>
            <input type="search" placeholder="Client, chambre, téléphone…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          </label>
        )}
      </div>

      {info && (
        <p className="sejours-info" role="status">
          {info}
        </p>
      )}
      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}
      {reservations === null && !erreur && <p className="hc-text-body texte-discret">Chargement…</p>}

      {onglet === "planning" && (
        <EcranPlanning
          client={client}
          onNouvelleReservation={(chambreId, date) => peutOperer && setVue({ id: "nouvelle", chambreInitialeId: chambreId, dateArriveeInitiale: date })}
          onOuvrirReservation={(id) => setVue({ id: "detail", reservationId: id })}
        />
      )}

      {reservations && onglet === "aujourdhui" && (
        <>
          {groupe("Arrivées attendues", jour.arrivees, "arrivee", "Aucune arrivée attendue aujourd'hui.")}
          {groupe("Départs prévus", jour.departs, "depart", "Aucun départ prévu aujourd'hui.")}
          {groupe("Clients présents", jour.presents, "present", "Aucun autre client dans l'hôtel.")}
        </>
      )}

      {reservations && (onglet === "avenir" || onglet === "encours" || onglet === "historique") && (
        <>
          {liste.length === 0 && (
            <div className="etat-vide">
              <CalendarDays size={32} strokeWidth={1.5} aria-hidden="true" />
              <p className="hc-text-subheading">
                {onglet === "avenir" ? "Aucune réservation à venir" : onglet === "encours" ? "Aucun client présent" : "Aucun séjour passé"}
              </p>
            </div>
          )}
          {liste.length > 0 && (
            <div className="carte-tableau" data-testid="tableau-reservations">
              <table className="tableau">
                <thead>
                  <tr>
                    {entete("client", "Client")}
                    {entete("chambre", "Chambre")}
                    {entete("arrivee", "Arrivée")}
                    {entete("depart", "Départ")}
                    {entete("nuits", "Nuits")}
                    {entete("acompte", "Acompte")}
                    {entete("statut", "Statut")}
                  </tr>
                </thead>
                <tbody>
                  {listeVisible.map((r) => (
                    <tr key={r.id} className="ligne-cliquable" onClick={() => setVue({ id: "detail", reservationId: r.id })}>
                      <td className="hc-text-body-strong">
                        {/* Le clic sur la ligne reste, mais seul ce bouton est atteignable au clavier. */}
                        <button
                          type="button"
                          className="lien-ligne"
                          aria-label={`Ouvrir la réservation de ${r.client.nom}, chambre ${r.chambre.numero}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setVue({ id: "detail", reservationId: r.id });
                          }}
                        >
                          {r.client.nom}
                        </button>
                      </td>
                      <td className="texte-discret">
                        {r.chambre.numero} · {r.chambre.type}
                      </td>
                      <td className="texte-discret">{dateCourte(r.dateArrivee)}</td>
                      <td className="texte-discret">{dateCourte(r.dateDepart)}</td>
                      <td className="texte-discret">{nuitsDe(r)}</td>
                      <td className="hc-text-price">
                        {formatMontant(r.acompte, r.chambre.devise)}
                        <BadgePayeEnLigne paiements={acomptes.get(r.id)} />
                      </td>
                      <td>
                        <StatusBadge tone={TONE_STATUT[r.statut]} label={LABEL_STATUT[r.statut]} />
                        {demandesBloquees.has(r.id) && (
                          <div data-testid="badge-chambre-deja-prise" style={{ marginTop: 2 }}>
                            <StatusBadge tone="danger" label="Chambre déjà réservée" />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {piedListe}
            </div>
          )}
        </>
      )}
    </div>
  );
}
