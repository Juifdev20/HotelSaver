import { randomUUID } from "expo-crypto";
import type { Chambre, Client, Reservation, StatutReservation } from "@hotel-chicago/types";
import { obtenirBase } from "./sqlite";
import { listerChambresMiroir } from "./chambresMirroir";

/**
 * Miroir local des réservations et clients (Phase 16) — mêmes conventions
 * que cafeteriaMirroir.ts : `id` local stable jamais renommé, `remoteId`
 * rempli une fois la création confirmée par le serveur. La consultation et
 * la création/modification (dates, acompte) fonctionnent hors ligne ; les
 * transitions de statut (check-in/out, confirmer, annuler) restent en
 * ligne — ce sont des actions transactionnelles hors du modèle
 * CREATE/UPDATE de la file (même borne que l'encaissement cafétaria).
 *
 * `facture` n'est pas mirrorée : les reçus/factures restent consultés en
 * ligne (EcranFacturation) — `facture` vaut toujours null ici.
 */
export interface ClientMiroir extends Client {
  remoteId: string | null;
}

export interface ReservationMiroir extends Reservation {
  remoteId: string | null;
}

interface ClientLigneBrute {
  id: string;
  remoteId: string | null;
  nom: string;
  telephone: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}

interface ReservationLigneBrute {
  id: string;
  remoteId: string | null;
  chambreId: string;
  clientId: string;
  dateArrivee: string;
  dateDepart: string;
  acompte: string;
  statut: string;
  origine: string;
  createdBy: string;
  annuleLe: string | null;
  motifAnnulation: string | null;
  updatedAt: string;
  syncVersion: number;
}

function clientDepuisBrut(brut: ClientLigneBrute): ClientMiroir {
  return {
    id: brut.id,
    remoteId: brut.remoteId,
    nom: brut.nom,
    telephone: brut.telephone,
    email: brut.email,
    updatedAt: brut.updatedAt,
    syncVersion: brut.syncVersion,
  };
}

/** Un client est « existant » côté serveur dès qu'il a un remoteId — seuls
 * ceux-là peuvent être référencés par `clientId` dans une nouvelle
 * réservation (un id local inconnu du serveur ferait échouer le push). */
export function estClientSynchronise(client: ClientMiroir): boolean {
  return client.remoteId !== null;
}

export async function listerClientsMiroir(): Promise<ClientMiroir[]> {
  const db = await obtenirBase();
  const bruts = await db.getAllAsync<ClientLigneBrute>("SELECT * FROM clients ORDER BY nom ASC", []);
  return bruts.map(clientDepuisBrut);
}

/** Reconstruit Reservation.client/chambre en joignant les tables locales —
 * GET /sync/pull ne renvoie que des lignes plates sans `include` (même
 * technique qu'assemblerComptes côté cafétaria). */
async function assemblerReservations(
  db: Awaited<ReturnType<typeof obtenirBase>>,
  reservationsBrutes: ReservationLigneBrute[]
): Promise<ReservationMiroir[]> {
  if (reservationsBrutes.length === 0) return [];

  const [clientsBruts, chambres] = await Promise.all([
    db.getAllAsync<ClientLigneBrute>("SELECT * FROM clients", []),
    listerChambresMiroir(),
  ]);

  const clientsParId = new Map(clientsBruts.map((c) => [c.id, clientDepuisBrut(c)]));
  const chambresParId = new Map<string, Chambre>(chambres.map((c) => [c.id, c]));

  const clientPour = (clientId: string): Client => {
    // Lignes locales : clientId = id local ; lignes tirées : id serveur,
    // qui correspond à clients.id (pull) ou clients.remoteId (optimiste confirmé).
    const brut =
      clientsParId.get(clientId) ??
      clientsBruts.map(clientDepuisBrut).find((c) => c.remoteId === clientId) ??
      null;
    return (
      brut ?? { id: clientId, nom: "Client inconnu", telephone: null, email: null, updatedAt: "", syncVersion: 0 }
    );
  };

  return reservationsBrutes.map((brut) => ({
    id: brut.id,
    remoteId: brut.remoteId,
    chambreId: brut.chambreId,
    chambre: chambresParId.get(brut.chambreId) ?? {
      id: brut.chambreId,
      numero: "?",
      type: "",
      prixParNuit: "0",
      devise: "USD" as Chambre["devise"],
      statut: "LIBRE" as Chambre["statut"],
      photos: [],
      updatedAt: "",
      syncVersion: 0,
    },
    clientId: brut.clientId,
    client: clientPour(brut.clientId),
    dateArrivee: brut.dateArrivee,
    dateDepart: brut.dateDepart,
    acompte: brut.acompte,
    statut: brut.statut as StatutReservation,
    origine: brut.origine,
    annuleLe: brut.annuleLe,
    motifAnnulation: brut.motifAnnulation,
    facture: null,
    syncVersion: brut.syncVersion,
  }));
}

/** Lecture instantanée du miroir — jamais un appel réseau. */
export async function listerReservationsMiroir(): Promise<ReservationMiroir[]> {
  const db = await obtenirBase();
  const bruts = await db.getAllAsync<ReservationLigneBrute>(
    "SELECT * FROM reservations ORDER BY dateArrivee DESC",
    []
  );
  return assemblerReservations(db, bruts);
}

/** `id` accepte l'id local ou l'id serveur (remoteId), comme partout dans le miroir. */
export async function obtenirReservationMiroir(id: string): Promise<ReservationMiroir | null> {
  const db = await obtenirBase();
  const brut = await db.getFirstAsync<ReservationLigneBrute>(
    "SELECT * FROM reservations WHERE id = ? OR remoteId = ?",
    [id, id]
  );
  if (!brut) return null;
  const [reservation] = await assemblerReservations(db, [brut]);
  return reservation;
}

export interface DonneesReservationLocale {
  chambre: Chambre;
  dateArrivee: string; // ISO
  dateDepart: string; // ISO
  acompte: number;
  /** Client existant synchronisé (remoteId requis) OU nouveau client inline. */
  clientExistant?: ClientMiroir;
  nouveauClient?: { nom: string; telephone?: string; email?: string };
  createdBy: string;
}

export interface ReservationLocaleCreee {
  reservation: ReservationMiroir;
  /** Payload à passer tel quel à moteurSync.mettreEnFile (CREATE Reservation). */
  payload: Record<string, unknown>;
}

/** Écriture optimiste : la réservation (+ le client local si nouveau) est
 * visible instantanément hors ligne ; l'appelant met ensuite l'opération en
 * file (`payload` retourné — voir EcranCaisse/creerCompteLocal pour le pattern). */
export async function creerReservationLocale(donnees: DonneesReservationLocale): Promise<ReservationLocaleCreee> {
  if (Boolean(donnees.clientExistant) === Boolean(donnees.nouveauClient)) {
    throw new Error("Fournir soit clientExistant, soit nouveauClient.");
  }
  const db = await obtenirBase();
  const idReservation = randomUUID();
  const maintenant = new Date().toISOString();

  let clientIdLocal: string;
  let clientPourAffichage: Client;
  let payloadClient: Record<string, unknown>;

  if (donnees.clientExistant) {
    const distant = donnees.clientExistant.remoteId;
    if (!distant) {
      throw new Error("Ce client n'est pas encore synchronisé — choisir un client synchronisé ou créer un nouveau client.");
    }
    clientIdLocal = distant;
    clientPourAffichage = donnees.clientExistant;
    payloadClient = { clientId: distant };
  } else {
    const nouveau = donnees.nouveauClient!;
    clientIdLocal = randomUUID();
    await db.runAsync(
      `INSERT INTO clients (id, remoteId, nom, telephone, email, createdAt, updatedAt, syncVersion)
       VALUES (?, NULL, ?, ?, ?, ?, ?, 1)`,
      [clientIdLocal, nouveau.nom, nouveau.telephone ?? null, nouveau.email ?? null, maintenant, maintenant]
    );
    clientPourAffichage = {
      id: clientIdLocal,
      nom: nouveau.nom,
      telephone: nouveau.telephone ?? null,
      email: nouveau.email ?? null,
      updatedAt: maintenant,
      syncVersion: 1,
    };
    // `clientLocalId` permet au serveur (sync.service.ts) de renvoyer le
    // mapping id local → id réel du Client créé implicitement — le même
    // mécanisme `enfants` que premierSousCompteLocalId, sinon le client
    // arriverait en doublon au pull suivant.
    payloadClient = { client: { nom: nouveau.nom, telephone: nouveau.telephone, email: nouveau.email }, clientLocalId: clientIdLocal };
  }

  await db.runAsync(
    `INSERT INTO reservations (id, remoteId, chambreId, clientId, dateArrivee, dateDepart, acompte, statut, origine, createdBy, annuleLe, motifAnnulation, updatedAt, syncVersion)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 1)`,
    [
      idReservation,
      donnees.chambre.id,
      clientIdLocal,
      donnees.dateArrivee,
      donnees.dateDepart,
      String(donnees.acompte),
      "CONFIRMEE",
      "RECEPTION",
      donnees.createdBy,
      maintenant,
    ]
  );

  const reservation: ReservationMiroir = {
    id: idReservation,
    remoteId: null,
    chambreId: donnees.chambre.id,
    chambre: donnees.chambre,
    clientId: clientIdLocal,
    client: clientPourAffichage,
    dateArrivee: donnees.dateArrivee,
    dateDepart: donnees.dateDepart,
    acompte: String(donnees.acompte),
    statut: "CONFIRMEE",
    origine: "RECEPTION",
    annuleLe: null,
    motifAnnulation: null,
    facture: null,
    syncVersion: 1,
  };

  return {
    reservation,
    payload: {
      chambreId: donnees.chambre.id,
      ...payloadClient,
      dateArrivee: donnees.dateArrivee,
      dateDepart: donnees.dateDepart,
      acompte: donnees.acompte,
    },
  };
}

/** Modification optimiste (dates, acompte) — n'est possible que pour une
 * réservation déjà synchronisée : l'UPDATE serveur exige remoteId +
 * baseSyncVersion (voir l'écran, qui grise le bouton sinon). */
export async function modifierReservationLocale(
  reservation: ReservationMiroir,
  modifs: { dateArrivee?: string; dateDepart?: string; acompte?: number }
): Promise<Record<string, unknown>> {
  const db = await obtenirBase();
  await db.runAsync(
    `UPDATE reservations SET dateArrivee = ?, dateDepart = ?, acompte = ?, updatedAt = ? WHERE id = ?`,
    [
      modifs.dateArrivee ?? reservation.dateArrivee,
      modifs.dateDepart ?? reservation.dateDepart,
      modifs.acompte !== undefined ? String(modifs.acompte) : reservation.acompte,
      new Date().toISOString(),
      reservation.id,
    ]
  );

  const payload: Record<string, unknown> = {};
  if (modifs.dateArrivee !== undefined) payload.dateArrivee = modifs.dateArrivee;
  if (modifs.dateDepart !== undefined) payload.dateDepart = modifs.dateDepart;
  if (modifs.acompte !== undefined) payload.acompte = modifs.acompte;
  return payload;
}

/** Écriture locale d'un changement confirmé par le serveur (confirmer,
 * check-in, annuler — actions en ligne) : met à jour le miroir pour
 * l'affichage immédiat, sans rien mettre en file — le prochain pull
 * réconciliera proprement (upsert idempotent sur la version serveur). */
export async function ecrireStatutReservationLocal(
  id: string,
  statut: StatutReservation,
  champs?: { annuleLe?: string; motifAnnulation?: string }
): Promise<void> {
  const db = await obtenirBase();
  await db.runAsync(
    "UPDATE reservations SET statut = ?, annuleLe = ?, motifAnnulation = ?, updatedAt = ? WHERE id = ?",
    [statut, champs?.annuleLe ?? null, champs?.motifAnnulation ?? null, new Date().toISOString(), id]
  );
}

/** Supprime une écriture optimiste retirée définitivement de la file
 * (écran Synchronisation) — la réservation n'existera jamais côté serveur.
 * Le client local créé avec elle est supprimé aussi s'il n'est référencé
 * par aucune autre réservation (évite les orphelins du répertoire). */
export async function supprimerEcritureReservationLocale(localId: string): Promise<void> {
  const db = await obtenirBase();
  const reservation = await db.getFirstAsync<{ clientId: string }>(
    "SELECT clientId FROM reservations WHERE id = ?",
    [localId]
  );
  await db.runAsync("DELETE FROM reservations WHERE id = ?", [localId]);
  if (reservation) {
    const autres = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM reservations WHERE clientId = ?",
      [reservation.clientId]
    );
    if ((autres?.n ?? 0) === 0) {
      await db.runAsync("DELETE FROM clients WHERE id = ? AND remoteId IS NULL", [reservation.clientId]);
    }
  }
}
