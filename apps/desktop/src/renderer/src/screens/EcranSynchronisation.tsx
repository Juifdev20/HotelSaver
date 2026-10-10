import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@hotel-chicago/ui";
import type { Miroir } from "@hotel-chicago/miroir-local";
import { SEUIL_ECHEC_DEFINITIF, resumerEtatSync, type ConflitSync, type EtatSync, type LigneFileAttente } from "@hotel-chicago/sync-engine";

export interface EcranSynchronisationProps {
  miroir: Miroir;
  etat: EtatSync | null;
  /** Session ouverte sans Internet : jours avant que la reconnexion devienne obligatoire. */
  joursRestants: number | null;
  modeHorsLigne: boolean;
  /** Efface les données de CET appareil pour cet hôtel (refusé tant que des actions n'ont pas été envoyées). */
  onEffacerDonnees: () => Promise<void>;
}

const LIBELLE_TYPE: Record<string, string> = {
  Chambre: "Chambre",
  Reservation: "Réservation",
  Client: "Fiche client",
  Produit: "Produit",
  MouvementStock: "Mouvement de stock",
  CompteCafeteria: "Compte cafétaria",
  SousCompte: "Personne du compte",
  LigneCommande: "Ligne de commande",
  Depense: "Dépense",
  Facture: "Facture du séjour",
  VenteCafeteria: "Encaissement cafétaria",
  ActionReservation: "Opération sur une réservation",
  ActionLigne: "Avancement en cuisine",
};

function heure(horodatage: string | null): string {
  if (!horodatage) return "jamais";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(horodatage));
}

/**
 * Tout ce qu'il faut savoir sur la synchronisation de CE poste : où en est l'envoi, ce que le serveur a refusé (à relire puis retirer),
 * les modifications en conflit (à trancher), et la gestion des données locales.
 */
export function EcranSynchronisation({ miroir, etat, joursRestants, modeHorsLigne, onEffacerDonnees }: EcranSynchronisationProps) {
  const [conflits, setConflits] = useState<ConflitSync[]>([]);
  const [refusees, setRefusees] = useState<LigneFileAttente[]>([]);
  const [enAttente, setEnAttente] = useState(0);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    const [c, file] = await Promise.all([miroir.moteur.listerConflits(), miroir.moteur.listerFileAttente()]);
    setConflits(c);
    setRefusees(file.filter((l) => l.attempts >= SEUIL_ECHEC_DEFINITIF));
    setEnAttente(file.filter((l) => l.attempts < SEUIL_ECHEC_DEFINITIF).length);
  }, [miroir]);

  useEffect(() => {
    void recharger();
  }, [recharger, etat?.enAttente, etat?.conflits, etat?.echecsDefinitifs]);

  const resume = etat ? resumerEtatSync(etat) : null;

  async function synchroniser() {
    setOccupe("sync");
    try {
      await miroir.moteur.forcerSynchronisation();
    } finally {
      setOccupe(null);
      await recharger();
    }
  }

  async function garderServeur(conflit: ConflitSync) {
    setOccupe(conflit.id);
    try {
      await miroir.moteur.resoudreConflitGarderServeur(conflit.id, conflit.entiteType, conflit.donneesServeur);
    } finally {
      setOccupe(null);
      await recharger();
    }
  }

  async function retirer(ligne: LigneFileAttente) {
    if (!window.confirm("Retirer cette action ? Elle disparaîtra de cet appareil et ne sera jamais envoyée au serveur.")) return;
    setOccupe(ligne.id);
    try {
      await miroir.abandonnerAction(ligne.id);
    } finally {
      setOccupe(null);
      await recharger();
    }
  }

  async function effacer() {
    setMessage(null);
    if (enAttente + refusees.length > 0) {
      setMessage("Des actions n'ont pas encore été envoyées : envoyez-les (ou retirez-les) avant d'effacer les données de cet appareil.");
      return;
    }
    if (!window.confirm("Effacer toutes les données de cet hôtel sur CET appareil ? Elles seront retéléchargées à la prochaine connexion à Internet. Sans Internet, vous ne pourrez plus travailler.")) return;
    setOccupe("effacer");
    try {
      await onEffacerDonnees();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Effacement impossible.");
      setOccupe(null);
    }
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Synchronisation</h1>
          <p className="hc-text-body page__sous-titre">{resume ? resume.detail : "Ouverture de la base locale…"}</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void synchroniser()} disabled={occupe !== null}>
          <RefreshCw size={16} aria-hidden="true" />
          Synchroniser maintenant
        </Button>
      </header>

      <div className="carte-formulaire" style={{ marginBottom: "var(--hc-space-4)" }}>
        <div className="parametres-ligne">
          <span className="hc-text-body">Connexion au serveur</span>
          <span className="hc-text-body-strong">{modeHorsLigne ? "Session ouverte sans Internet" : etat?.enLigne ? "Connecté" : "Injoignable"}</span>
        </div>
        <div className="parametres-ligne">
          <span className="hc-text-body">Actions en attente d'envoi</span>
          <span className="hc-text-body-strong">{enAttente}</span>
        </div>
        <div className="parametres-ligne">
          <span className="hc-text-body">Dernière synchronisation réussie</span>
          <span className="hc-text-body-strong">{heure(etat?.derniereSyncReussieLe ?? null)}</span>
        </div>
        {joursRestants !== null && (
          <div className="parametres-ligne">
            <span className="hc-text-body">Reconnexion à Internet obligatoire dans</span>
            <span className="hc-text-body-strong">{joursRestants} jour{joursRestants > 1 ? "s" : ""}</span>
          </div>
        )}
        {etat?.horlogeSuspecte && (
          <p role="alert" className="hc-text-body texte-erreur">
            <AlertTriangle size={14} aria-hidden="true" /> L'heure de cet ordinateur diffère de plus de 5 minutes de celle du serveur. Corrigez-la : elle date les ventes.
          </p>
        )}
        {etat?.derniereErreur && <p className="hc-text-caption texte-discret">Dernière erreur : {etat.derniereErreur}</p>}
        <div className="parametres-ligne">
          <span className="hc-text-body">Numéro de ce poste (reçus provisoires)</span>
          <span className="hc-text-body-strong">{miroir.codePoste()}</span>
        </div>
      </div>

      {refusees.length > 0 && (
        <div className="carte-formulaire" style={{ marginBottom: "var(--hc-space-4)" }}>
          <p className="hc-text-label texte-erreur">
            <AlertTriangle size={14} aria-hidden="true" /> Actions refusées par le serveur ({refusees.length})
          </p>
          <p className="hc-text-caption texte-discret">Elles ne seront pas renvoyées. Lisez le motif, refaites l'action si besoin, puis retirez-la de la liste.</p>
          {refusees.map((l) => (
            <div key={l.id} className="parametres-ligne">
              <span className="hc-text-body">
                <strong>{LIBELLE_TYPE[l.entiteType] ?? l.entiteType}</strong> — {l.lastError ?? "Refusée."}
              </span>
              <Button type="button" variant="secondary" onClick={() => void retirer(l)} disabled={occupe !== null}>
                <Trash2 size={14} aria-hidden="true" />
                Retirer
              </Button>
            </div>
          ))}
        </div>
      )}

      {conflits.length > 0 && (
        <div className="carte-formulaire" style={{ marginBottom: "var(--hc-space-4)" }}>
          <p className="hc-text-label texte-erreur">Modifications en conflit ({conflits.length})</p>
          <p className="hc-text-caption texte-discret">Quelqu'un d'autre a modifié la même fiche pendant que vous étiez hors ligne. Votre changement n'a pas été appliqué.</p>
          {conflits.map((c) => (
            <div key={c.id} className="parametres-ligne">
              <span className="hc-text-body">
                <strong>{LIBELLE_TYPE[c.entiteType] ?? c.entiteType}</strong> — votre changement : {JSON.stringify(c.monChangement)}
              </span>
              <Button type="button" variant="secondary" onClick={() => void garderServeur(c)} disabled={occupe !== null}>
                Garder la version du serveur
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="carte-formulaire">
        <p className="hc-text-label texte-discret">
          <CloudOff size={14} aria-hidden="true" /> Données de cet appareil
        </p>
        <p className="hc-text-caption texte-discret">
          Cet appareil garde une copie des données de votre hôtel pour travailler sans Internet. Effacez-la sur un ordinateur partagé ou que vous rendez.
        </p>
        <Button type="button" variant="secondary" onClick={() => void effacer()} disabled={occupe !== null}>
          <Trash2 size={14} aria-hidden="true" />
          Effacer les données de cet appareil
        </Button>
        {message && <p role="alert" className="hc-text-body texte-erreur">{message}</p>}
      </div>
    </div>
  );
}
