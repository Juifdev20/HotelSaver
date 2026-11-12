import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { StatutLigne } from "@hotel-chicago/types";
import { ChefHat, Clock, Maximize2, Minimize2, RefreshCw } from "lucide-react";

interface LigneCuisine {
  id: string;
  produit: { nom: string };
  sousCompte: { nom: string };
  quantite: number;
  statut: StatutLigne;
  createdAt: string;
  note?: string | null;
  prisEnChargeA?: string | null;
}

interface GroupeCuisine {
  compteId: string;
  tableOuNom: string;
  ouvertLe: string;
  lignes: LigneCuisine[];
}

function dureeDepuis(iso: string, maintenant: number): string {
  const diff = Math.floor((maintenant - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  return `${Math.floor(diff / 3600)}h${Math.floor((diff % 3600) / 60).toString().padStart(2, "0")}`;
}

export interface EcranCuisineProps {
  client: ClientApi;
  /** Clic sur l'en-tête d'une commande : ouvre le détail complet du compte. */
  onOuvrirCompte?: (compteId: string) => void;
  /** Affiché dans l'onglet « En cuisine » de « En cours » : pas de titre de page, la page est celle d'« En cours ». */
  integre?: boolean;
}

/** Ligne marquée « Prêt » sur CE poste : elle reste visible dans « Prêt à servir » 30 min (le serveur ne renvoie plus que les lignes à préparer). */
interface LignePrete {
  ligne: LigneCuisine;
  compteId: string;
  tableOuNom: string;
  ouvertLe: string;
  a: number;
}
const MINUTES_PRET_VISIBLE = 30;

/**
 * Écran de cuisine (KDS — Kitchen Display System).
 * Affiche les lignes EN_ATTENTE et EN_PREPARATION groupées par table.
 * Actualisation automatique toutes les 10 secondes.
 */
export function EcranCuisine({ client, onOuvrirCompte, integre = false }: EcranCuisineProps) {
  const [prets, setPrets] = useState<LignePrete[]>([]);
  const [groupes, setGroupes] = useState<GroupeCuisine[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  // Échec d'un changement de statut : reste affiché (le rafraîchissement automatique ne l'efface pas).
  const [erreurAction, setErreurAction] = useState<string | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [enCours, setEnCours] = useState<Set<string>>(new Set());
  const chargementInitial = useRef(true);
  // Plein écran : l'écran de cuisine se regarde de loin, depuis le poste de préparation.
  const refPage = useRef<HTMLDivElement>(null);
  const [pleinEcran, setPleinEcran] = useState(false);
  useEffect(() => {
    const maj = () => setPleinEcran(document.fullscreenElement === refPage.current);
    document.addEventListener("fullscreenchange", maj);
    return () => document.removeEventListener("fullscreenchange", maj);
  }, []);
  function basculerPleinEcran() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void refPage.current?.requestFullscreen?.();
  }

  const charger = useCallback(
    (silencieux = false) => {
      if (!silencieux) setChargement(true);
      client
        .lignesPourCuisine()
        .then((data) => {
          setGroupes(data as GroupeCuisine[]);
          setErreur(null);
        })
        // Les commandes déjà affichées sont conservées : on ne vide jamais l'écran sur une erreur de rafraîchissement.
        .catch((e: Error) => setErreur(e.message))
        .finally(() => setChargement(false));
    },
    [client]
  );

  // Chargement initial
  useEffect(() => {
    charger();
    chargementInitial.current = false;
  }, [charger]);

  // Actualisation automatique toutes les 10 secondes
  useEffect(() => {
    const id = setInterval(() => charger(true), 10_000);
    return () => clearInterval(id);
  }, [charger]);

  // Horloge pour les timers (toutes les 5 secondes)
  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  async function avancerStatut(ligneId: string, statut: StatutLigne, nomProduit: string) {
    setEnCours((prev) => new Set(prev).add(ligneId));
    setErreurAction(null);
    try {
      await client.majStatutLigne(ligneId, statut);
      if (statut === StatutLigne.PRET) {
        const groupe = groupes.find((g) => g.lignes.some((l) => l.id === ligneId));
        const ligne = groupe?.lignes.find((l) => l.id === ligneId);
        if (groupe && ligne) {
          setPrets((p) => [{ ligne: { ...ligne, statut: StatutLigne.PRET }, compteId: groupe.compteId, tableOuNom: groupe.tableOuNom, ouvertLe: groupe.ouvertLe, a: Date.now() }, ...p]);
        }
      }
      charger(true);
    } catch (e) {
      setErreurAction(
        `« ${nomProduit} » n'a pas pu être mis à jour${e instanceof Error && e.message ? ` (${e.message})` : ""}. Réessayez : la commande reste dans son état précédent.`
      );
    } finally {
      setEnCours((prev) => {
        const next = new Set(prev);
        next.delete(ligneId);
        return next;
      });
    }
  }

  const attente = groupes.flatMap((g) => g.lignes).filter((l) => l.statut === StatutLigne.EN_ATTENTE).length;
  const enPrep = groupes.flatMap((g) => g.lignes).filter((l) => l.statut === StatutLigne.EN_PREPARATION).length;

  const pretsVisibles = prets.filter((p) => maintenant - p.a < MINUTES_PRET_VISIBLE * 60_000);
  const groupesPrets: GroupeCuisine[] = [];
  for (const p of pretsVisibles) {
    const existant = groupesPrets.find((g) => g.compteId === p.compteId);
    if (existant) existant.lignes.push(p.ligne);
    else groupesPrets.push({ compteId: p.compteId, tableOuNom: p.tableOuNom, ouvertLe: p.ouvertLe, lignes: [p.ligne] });
  }
  const filtrer = (statut: StatutLigne): GroupeCuisine[] =>
    groupes.map((g) => ({ ...g, lignes: g.lignes.filter((l) => l.statut === statut) })).filter((g) => g.lignes.length > 0);

  function carte(groupe: GroupeCuisine) {
    const plusAncienne = groupe.lignes[0]?.createdAt ?? groupe.ouvertLe;
    const diffMin = Math.floor((maintenant - new Date(plusAncienne).getTime()) / 60_000);
    const pret = groupe.lignes.every((l) => l.statut === StatutLigne.PRET);
    const urgente = !pret && diffMin >= 15;
    const alerte = !pret && diffMin >= 8;
    return (
      <div key={groupe.compteId} className={`kds-carte${urgente ? " kds-carte--urgente" : alerte ? " kds-carte--alerte" : ""}`}>
        <div className="kds-carte__entete">
          {onOuvrirCompte ? (
            <button type="button" className="kds-carte__table kds-carte__table--lien" onClick={() => onOuvrirCompte(groupe.compteId)} title="Ouvrir le compte">
              {groupe.tableOuNom}
            </button>
          ) : (
            <span className="hc-text-label kds-carte__table">{groupe.tableOuNom}</span>
          )}
          <span className={`hc-text-caption kds-carte__timer${urgente ? " kds-carte__timer--urgente" : ""}`}>
            <Clock size={12} aria-hidden="true" />
            {dureeDepuis(plusAncienne, maintenant)}
          </span>
        </div>
        <div className="kds-carte__lignes">
          {groupe.lignes.map((ligne) => {
            const occupee = enCours.has(ligne.id);
            const enAttente = ligne.statut === StatutLigne.EN_ATTENTE;
            const estPret = ligne.statut === StatutLigne.PRET;
            return (
              <div key={ligne.id} className={`kds-ligne kds-ligne--${estPret ? "pret" : enAttente ? "attente" : "preparation"}`}>
                <div className="kds-ligne__info">
                  <span className="hc-text-body-strong">
                    {ligne.quantite > 1 && <span className="kds-ligne__qte">{ligne.quantite}×</span>}
                    {ligne.produit.nom}
                  </span>
                  {ligne.sousCompte.nom && <span className="hc-text-caption texte-discret">pour {ligne.sousCompte.nom}</span>}
                  {ligne.note && <span className="hc-text-caption kds-ligne__note">{ligne.note}</span>}
                </div>
                {estPret ? (
                  <span className="hc-text-caption kds-ligne__servir">À servir</span>
                ) : (
                  <button
                    type="button"
                    className={`kds-ligne__btn${enAttente ? " kds-ligne__btn--prendre" : " kds-ligne__btn--pret"}`}
                    onClick={() => avancerStatut(ligne.id, enAttente ? StatutLigne.EN_PREPARATION : StatutLigne.PRET, ligne.produit.nom)}
                    disabled={occupee}
                    aria-label={enAttente ? `Prendre en charge ${ligne.produit.nom}` : `Marquer prêt ${ligne.produit.nom}`}
                  >
                    {occupee ? "…" : enAttente ? "Prendre en charge" : "Prêt ✓"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const colonnes: { cle: string; titre: string; groupes: GroupeCuisine[]; vide: string }[] = [
    { cle: "attente", titre: "À prendre en charge", groupes: filtrer(StatutLigne.EN_ATTENTE), vide: "Rien à prendre en charge." },
    { cle: "preparation", titre: "En préparation", groupes: filtrer(StatutLigne.EN_PREPARATION), vide: "Rien en préparation." },
    { cle: "pret", titre: "Prêt à servir", groupes: groupesPrets, vide: "Les plats prêts apparaissent ici." },
  ];

  return (
    <div className={integre ? "page--cuisine-integree page--cuisine" : "page page--cuisine"} ref={refPage}>
      <header className={integre ? "page__entete page__entete--discret" : "page__entete"}>
        <div>
          {!integre && <h1 className="hc-text-display-md page__titre">Cuisine</h1>}
          <p className="hc-text-body page__sous-titre" aria-live="polite">
            {attente > 0 && (
              <span className="kds-compteur kds-compteur--attente">{attente} en attente</span>
            )}
            {enPrep > 0 && (
              <span className="kds-compteur kds-compteur--preparation">{enPrep} en préparation</span>
            )}
            {attente === 0 && enPrep === 0 && "Aucune commande active."}
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
          <button
            type="button"
            className="kds-rafraichir"
            onClick={basculerPleinEcran}
            title={pleinEcran ? "Quitter le plein écran" : "Plein écran"}
            aria-label={pleinEcran ? "Quitter le plein écran" : "Plein écran"}
          >
            {pleinEcran ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
          </button>
          <button type="button" className="kds-rafraichir" onClick={() => charger()} title="Actualiser maintenant" aria-label="Actualiser">
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      {erreurAction && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreurAction}
        </p>
      )}

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {groupes.length > 0
            ? `Actualisation impossible (${erreur}). Les commandes affichées peuvent ne plus être à jour.`
            : erreur}
        </p>
      )}

      {chargement && groupes.length === 0 && pretsVisibles.length === 0 ? (
        <p className="hc-text-body texte-discret">Chargement…</p>
      ) : groupes.length === 0 && pretsVisibles.length === 0 ? (
        <div className="kds-vide">
          <ChefHat size={48} aria-hidden="true" />
          <p className="hc-text-body-strong">Cuisine à jour !</p>
          <p className="hc-text-body texte-discret">Toutes les commandes ont été servies.</p>
        </div>
      ) : (
        <div className="kds-colonnes">
          {colonnes.map((c) => (
            <section key={c.cle} className={`kds-colonne kds-colonne--${c.cle}`} aria-label={c.titre}>
              <h2 className="kds-colonne__titre hc-text-label">
                {c.titre}
                <span className="kds-colonne__nombre">{c.groupes.reduce((n, g) => n + g.lignes.length, 0)}</span>
              </h2>
              {c.groupes.length === 0 ? <p className="hc-text-caption texte-discret kds-colonne__vide">{c.vide}</p> : c.groupes.map(carte)}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
