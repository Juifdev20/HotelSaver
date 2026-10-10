import type { EtatSync } from "./types";

export type NiveauSync = "ok" | "attente" | "attention" | "horsLigne" | "danger";

export interface ResumeSync {
  niveau: NiveauSync;
  /** Court, pour l'en-tête : « À jour », « 3 actions à envoyer »… */
  titre: string;
  /** Une phrase qui dit la vérité sur la situation, sans minimiser. */
  detail: string;
}

/** Au-delà, les données affichées peuvent être périmées : on le dit. */
const SYNCHRO_ANCIENNE_MS = 24 * 3_600_000;

function depuis(horodatage: string | null, maintenant: number): string {
  if (!horodatage) return "jamais";
  const minutes = Math.max(0, Math.round((maintenant - Date.parse(horodatage)) / 60_000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 48) return `il y a ${heures} h`;
  return `il y a ${Math.round(heures / 24)} jours`;
}

const actions = (n: number) => `${n} action${n > 1 ? "s" : ""}`;

/**
 * Résume l'état de synchronisation pour l'utilisateur, SANS rassurer à tort : « à jour » n'est dit que si la dernière
 * synchronisation complète a réussi, qu'il ne reste rien à envoyer et qu'aucune action n'a été refusée.
 * Un seul endroit pour mobile et bureau : les deux affichent exactement la même vérité.
 */
export function resumerEtatSync(etat: EtatSync, maintenant: number = Date.now()): ResumeSync {
  const derniere = depuis(etat.derniereSyncReussieLe, maintenant);

  if (etat.conflits > 0) {
    return { niveau: "danger", titre: "Conflit à vérifier", detail: `${etat.conflits} modification${etat.conflits > 1 ? "s" : ""} en conflit avec le serveur : ouvrez « Synchronisation » pour décider.` };
  }
  if (etat.echecsDefinitifs > 0) {
    return { niveau: "danger", titre: "Action refusée", detail: `${actions(etat.echecsDefinitifs)} refusée${etat.echecsDefinitifs > 1 ? "s" : ""} par le serveur : elle${etat.echecsDefinitifs > 1 ? "s ne seront" : " ne sera"} pas renvoyée${etat.echecsDefinitifs > 1 ? "s" : ""}. Ouvrez « Synchronisation » pour la${etat.echecsDefinitifs > 1 ? "s" : ""} revoir.` };
  }
  if (!etat.enLigne) {
    return etat.enAttente > 0
      ? { niveau: "horsLigne", titre: `Hors ligne · ${actions(etat.enAttente)} à envoyer`, detail: `Pas de connexion. Vos ${actions(etat.enAttente)} sont gardées sur cet appareil et partiront au retour du réseau. Dernière synchro : ${derniere}.` }
      : { niveau: "horsLigne", titre: "Hors ligne", detail: `Pas de connexion : vous travaillez sur les données de cet appareil. Dernière synchro : ${derniere}.` };
  }
  if (etat.derniereErreur) {
    return { niveau: "attention", titre: "Synchro en difficulté", detail: `Connecté, mais la dernière synchronisation a échoué (${etat.derniereErreur}). Nouvel essai automatique. Dernière synchro réussie : ${derniere}.` };
  }
  if (etat.horlogeSuspecte) {
    return { niveau: "attention", titre: "Horloge à corriger", detail: "L'heure de cet appareil est différente de celle du serveur de plus de 5 minutes : corrigez-la (dates des ventes, licence)." };
  }
  if (etat.enAttente > 0) {
    return { niveau: "attente", titre: `${actions(etat.enAttente)} à envoyer`, detail: `${actions(etat.enAttente)} en cours d'envoi au serveur.` };
  }
  if (!etat.derniereSyncReussieLe) {
    return { niveau: "attente", titre: "Première synchro…", detail: "Récupération des données depuis le serveur." };
  }
  if (maintenant - Date.parse(etat.derniereSyncReussieLe) > SYNCHRO_ANCIENNE_MS) {
    return { niveau: "attention", titre: "Données anciennes", detail: `Dernière synchro réussie ${derniere} : les données affichées peuvent être périmées.` };
  }
  return { niveau: "ok", titre: "À jour", detail: `Tout est synchronisé (${derniere}).` };
}
