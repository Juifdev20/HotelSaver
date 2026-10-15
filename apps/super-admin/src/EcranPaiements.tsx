import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, StatusBadge, useTitrePage, type StatusTone } from "@hotel-chicago/ui";
import { LIBELLE_OPERATEUR, formuleParCode, montantAbonnement } from "@hotel-chicago/regles";
import type { FormuleAbonnement } from "@hotel-chicago/regles";
import type { PaiementAbonnementSupport } from "@hotel-chicago/api-client";
import type { StatutPaiementAbonnement } from "@hotel-chicago/types";
import { EnteteApp, type Onglet } from "./EnteteApp";

export type ResultatReverification = "credite" | "toujours";

export interface EcranPaiementsProps {
  paiements: PaiementAbonnementSupport[];
  /** Catalogue courant des formules (pour afficher leur nom). */
  formules: FormuleAbonnement[];
  chargement: boolean;
  erreur: string | null;
  onActualiser: () => void;
  /** Interroge ScanLinkPay ; lève une erreur lisible si la demande échoue. */
  onReverifier: (id: string) => Promise<ResultatReverification>;
  onChangerOnglet: (onglet: Onglet) => void;
  onDeconnexion: () => void;
}

type Filtre = "TOUS" | "EN_ATTENTE" | "REUSSI" | "ECHOUE";

const FILTRES: { id: Filtre; libelle: string }[] = [
  { id: "TOUS", libelle: "Tous" },
  { id: "EN_ATTENTE", libelle: "En attente" },
  { id: "REUSSI", libelle: "Réussis" },
  { id: "ECHOUE", libelle: "Échoués" },
];

const STATUT: Record<StatutPaiementAbonnement, { libelle: string; tone: StatusTone }> = {
  EN_ATTENTE: { libelle: "En attente", tone: "warning" },
  REUSSI: { libelle: "Réussi", tone: "success" },
  ECHEC: { libelle: "Échoué", tone: "danger" },
  EXPIRE: { libelle: "Expiré", tone: "neutral" },
};

function correspond(p: PaiementAbonnementSupport, filtre: Filtre): boolean {
  if (filtre === "TOUS") return true;
  if (filtre === "ECHOUE") return p.statut === "ECHEC" || p.statut === "EXPIRE";
  return p.statut === filtre;
}

const formatDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Lubumbashi" });

function dateHeure(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : formatDate.format(d);
}

function libelleFormule(code: string, formules: FormuleAbonnement[]): string {
  return formuleParCode(code, formules.length > 0 ? formules : undefined)?.nom ?? code;
}

/** Montant dans la devise du paiement, ou « — » si ScanLinkPay ne l'a pas donné (ou paiement saisi à la main). */
function montantOuTiret(montant: number | null | undefined, devise: "USD" | "CDF"): string {
  return typeof montant === "number" ? montantAbonnement(montant, devise) : "—";
}

/** Référence en police mono + bouton Copier (retour « Copié » annoncé aux lecteurs d'écran). */
function Reference({ etiquette, valeur }: { etiquette: string; valeur: string | null }) {
  const [etat, setEtat] = useState<"repos" | "copie" | "echec">("repos");
  const minuterie = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(minuterie.current), []);

  if (!valeur) {
    return (
      <div className="reference">
        <span className="reference__etiquette">{etiquette}</span>
        <span className="reference__vide">—</span>
      </div>
    );
  }

  async function copier(texte: string) {
    try {
      await navigator.clipboard.writeText(texte);
      setEtat("copie");
    } catch {
      setEtat("echec");
    }
    window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(() => setEtat("repos"), 2000);
  }

  return (
    <div className="reference">
      <span className="reference__etiquette">{etiquette}</span>
      <span className="reference__ligne">
        <code className="reference__valeur">{valeur}</code>
        <Button variant="secondary" size="sm" aria-label={`Copier la ${etiquette.toLowerCase()} ${valeur}`} onClick={() => void copier(valeur)}>
          {etat === "copie" ? "Copié" : etat === "echec" ? "Échec" : "Copier"}
        </Button>
      </span>
      <span className="visuellement-cache" role="status">
        {etat === "copie" ? "Référence copiée." : etat === "echec" ? "Copie impossible : sélectionnez la référence à la main." : ""}
      </span>
    </div>
  );
}

export function EcranPaiements({ paiements, formules, chargement, erreur, onActualiser, onReverifier, onChangerOnglet, onDeconnexion }: EcranPaiementsProps) {
  const [filtre, setFiltre] = useState<Filtre>("TOUS");
  const [idEnCours, setIdEnCours] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ type: "succes" | "info" | "erreur"; texte: string } | null>(null);

  useTitrePage("Paiements en ligne", "HotelSaver Super-Admin");

  // Du plus récent au plus ancien, quel que soit l'ordre reçu.
  const tries = useMemo(() => [...paiements].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [paiements]);
  const visibles = tries.filter((p) => correspond(p, filtre));
  const decompte = (f: Filtre) => tries.filter((p) => correspond(p, f)).length;

  async function reverifier(p: PaiementAbonnementSupport) {
    setIdEnCours(p.id);
    setRetour(null);
    try {
      const resultat = await onReverifier(p.id);
      setRetour(
        resultat === "credite"
          ? { type: "succes", texte: `Crédité : l'abonnement a été prolongé (${p.hotelNom}).` }
          : { type: "info", texte: `Toujours pas de confirmation de ScanLinkPay (${p.hotelNom}).` }
      );
    } catch (e) {
      setRetour({ type: "erreur", texte: e instanceof Error ? e.message : "La revérification a échoué. Réessayez dans un instant." });
    } finally {
      setIdEnCours(null);
    }
  }

  const afficherTableau = tries.length > 0;

  return (
    <div className="page">
      <EnteteApp titre="Paiements en ligne" onglet="paiements" onChangerOnglet={onChangerOnglet}>
        <Button variant="secondary" onClick={onActualiser} disabled={chargement}>
          {chargement ? "Actualisation…" : "Actualiser"}
        </Button>
        <Button variant="secondary" onClick={onDeconnexion}>
          Déconnexion
        </Button>
      </EnteteApp>

      <aside className="encart" aria-label="Aide">
        <p>
          <strong>Un paiement « échoué » dont le client affirme avoir été débité :</strong> cliquez sur Revérifier, puis cherchez la référence dans
          ScanLinkPay.
        </p>
      </aside>

      <div className="barre-filtres" role="group" aria-label="Filtrer par statut">
        {FILTRES.map((f) => (
          <button key={f.id} type="button" className={`filtre ${filtre === f.id ? "filtre--actif" : ""}`} aria-pressed={filtre === f.id} onClick={() => setFiltre(f.id)}>
            {f.libelle} <span className="filtre__nombre">({decompte(f.id)})</span>
          </button>
        ))}
      </div>

      {chargement && (
        <p role="status" className="chargement">
          {tries.length === 0 ? "Chargement des paiements…" : "Actualisation…"}
        </p>
      )}
      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}
      {retour && (
        <p className={retour.type === "succes" ? "succes" : retour.type === "erreur" ? "erreur" : "info"} role={retour.type === "erreur" ? "alert" : "status"}>
          {retour.texte}
        </p>
      )}

      {afficherTableau && visibles.length > 0 && (
        <div className="tableau-defilant">
          <table className="tableau">
            <caption className="visuellement-cache">Paiements d'abonnement en ligne, du plus récent au plus ancien</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Hôtel</th>
                <th scope="col">Formule</th>
                <th scope="col">Durée</th>
                <th scope="col">Montant</th>
                <th scope="col">Commission ScanLinkPay</th>
                <th scope="col">Total débité</th>
                <th scope="col">Opérateur</th>
                <th scope="col">Numéro</th>
                <th scope="col">Statut</th>
                <th scope="col">Références ScanLinkPay</th>
                <th scope="col">
                  <span className="visuellement-cache">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => {
                const st = STATUT[p.statut] ?? { libelle: p.statut, tone: "neutral" as StatusTone };
                return (
                  <tr key={p.id}>
                    <td>{dateHeure(p.createdAt)}</td>
                    <th scope="row" className="cellule-hotel">
                      {p.hotelNom}
                      <span className="cellule-hotel__sous">{p.sousDomaine}</span>
                    </th>
                    <td>{libelleFormule(p.formule, formules)}</td>
                    <td>{p.mois} mois</td>
                    <td className="nombre">{montantAbonnement(p.montant, p.devise)}</td>
                    <td className="nombre">{montantOuTiret(p.commission, p.devise)}</td>
                    <td className="nombre">{montantOuTiret(p.total, p.devise)}</td>
                    <td>{p.source === "SUPPORT" ? "Saisi à la main" : (p.operateur && LIBELLE_OPERATEUR[p.operateur]) || p.operateur || "—"}</td>
                    <td>{p.telephoneMasque ?? "—"}</td>
                    <td>
                      <StatusBadge tone={st.tone} label={st.libelle} />
                      {p.statut !== "REUSSI" && p.messageErreur && <span className="message-paiement">{p.messageErreur}</span>}
                    </td>
                    <td>
                      <Reference etiquette="Demande" valeur={p.referenceDemande} />
                      <Reference etiquette="Fournisseur" valeur={p.referenceFournisseur} />
                    </td>
                    <td>
                      {p.statut !== "REUSSI" && p.source !== "SUPPORT" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={idEnCours !== null}
                          aria-label={`Revérifier le paiement de ${p.hotelNom} du ${dateHeure(p.createdAt)}`}
                          onClick={() => void reverifier(p)}
                        >
                          {idEnCours === p.id ? "Vérification…" : "Revérifier"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!chargement && !erreur && tries.length === 0 && <p className="vide">Aucun paiement en ligne pour l'instant.</p>}
      {!chargement && tries.length > 0 && visibles.length === 0 && <p className="vide">Aucun paiement dans cette catégorie.</p>}
    </div>
  );
}
