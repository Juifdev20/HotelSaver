import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { StatutLigne } from "@hotel-chicago/types";
import { ChefHat, Clock, RefreshCw } from "lucide-react";

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
}

/**
 * Écran de cuisine (KDS — Kitchen Display System).
 * Affiche les lignes EN_ATTENTE et EN_PREPARATION groupées par table.
 * Actualisation automatique toutes les 10 secondes.
 */
export function EcranCuisine({ client, onOuvrirCompte }: EcranCuisineProps) {
  const [groupes, setGroupes] = useState<GroupeCuisine[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [enCours, setEnCours] = useState<Set<string>>(new Set());
  const chargementInitial = useRef(true);

  const charger = useCallback(
    (silencieux = false) => {
      if (!silencieux) setChargement(true);
      setErreur(null);
      client
        .lignesPourCuisine()
        .then((data) => setGroupes(data as GroupeCuisine[]))
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

  async function avancerStatut(ligneId: string, statut: StatutLigne) {
    setEnCours((prev) => new Set(prev).add(ligneId));
    try {
      await client.majStatutLigne(ligneId, statut);
      charger(true);
    } catch {
      // Silencieux : le rafraîchissement automatique remettra l'état correct
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

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">
            <ChefHat size={24} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: "var(--hc-space-2)" }} />
            Cuisine
          </h1>
          <p className="hc-text-body page__sous-titre">
            {attente > 0 && (
              <span className="kds-compteur kds-compteur--attente">{attente} en attente</span>
            )}
            {enPrep > 0 && (
              <span className="kds-compteur kds-compteur--preparation">{enPrep} en préparation</span>
            )}
            {attente === 0 && enPrep === 0 && "Aucune commande active."}
          </p>
        </div>
        <button
          type="button"
          className="kds-rafraichir"
          onClick={() => charger()}
          title="Actualiser maintenant"
          aria-label="Actualiser"
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      {chargement && groupes.length === 0 ? (
        <p className="hc-text-body texte-discret">Chargement…</p>
      ) : groupes.length === 0 ? (
        <div className="kds-vide">
          <ChefHat size={48} aria-hidden="true" />
          <p className="hc-text-body-strong">Cuisine à jour !</p>
          <p className="hc-text-body texte-discret">Toutes les commandes ont été servies.</p>
        </div>
      ) : (
        <div className="kds-grille">
          {groupes.map((groupe) => {
            const plusAncienne = groupe.lignes[0]?.createdAt ?? groupe.ouvertLe;
            const diffMin = Math.floor((maintenant - new Date(plusAncienne).getTime()) / 60_000);
            const urgente = diffMin >= 15;
            const alerte = diffMin >= 8;
            return (
              <div
                key={groupe.compteId}
                className={`kds-carte${urgente ? " kds-carte--urgente" : alerte ? " kds-carte--alerte" : ""}`}
              >
                <div className="kds-carte__entete">
                  {onOuvrirCompte ? (
                    <button
                      type="button"
                      className="kds-carte__table kds-carte__table--lien"
                      onClick={() => onOuvrirCompte(groupe.compteId)}
                      title="Ouvrir le compte"
                    >
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
                    return (
                      <div
                        key={ligne.id}
                        className={`kds-ligne kds-ligne--${enAttente ? "attente" : "preparation"}`}
                      >
                        <div className="kds-ligne__info">
                          <span className="hc-text-body-strong">
                            {ligne.quantite > 1 && <span className="kds-ligne__qte">{ligne.quantite}×</span>}
                            {ligne.produit.nom}
                          </span>
                          {ligne.sousCompte.nom && (
                            <span className="hc-text-caption texte-discret">pour {ligne.sousCompte.nom}</span>
                          )}
                          {ligne.note && (
                            <span className="hc-text-caption kds-ligne__note">{ligne.note}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          className={`kds-ligne__btn${enAttente ? " kds-ligne__btn--prendre" : " kds-ligne__btn--pret"}`}
                          onClick={() =>
                            avancerStatut(ligne.id, enAttente ? StatutLigne.EN_PREPARATION : StatutLigne.PRET)
                          }
                          disabled={occupee}
                          aria-label={enAttente ? `Prendre en charge ${ligne.produit.nom}` : `Marquer prêt ${ligne.produit.nom}`}
                        >
                          {occupee ? "…" : enAttente ? "Prendre en charge" : "Prêt ✓"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
