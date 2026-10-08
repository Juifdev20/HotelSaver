import { randomUUID } from "expo-crypto";
import type { DepartementRapport, Devise } from "@hotel-chicago/types";
import { obtenirBase } from "./sqlite";

/** Ligne brute de GET /sync/pull (findMany Prisma plat) : `date` arrive en
 * ISO complet (« 2026-10-07T00:00:00.000Z »), `montant` en chaîne. */
export interface DepenseBrute {
  id: string;
  departement: DepartementRapport;
  date: string;
  motif: string;
  montant: string;
  devise: Devise;
  creeParId: string;
  creeParNom: string;
  annulee: boolean;
  annuleeLe: string | null;
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}

/** Dépense lue du miroir local — `id` local stable, `remoteId` null tant
 * que la création n'a pas été confirmée par le serveur. */
export interface DepenseMiroir {
  id: string;
  remoteId: string | null;
  departement: DepartementRapport;
  /** « AAAA-MM-JJ ». */
  date: string;
  motif: string;
  montant: string;
  devise: Devise;
  creeParNom: string;
  annulee: boolean;
  syncVersion: number;
}

interface LigneDepenseSql extends Omit<DepenseMiroir, "annulee"> {
  annulee: number;
}

type Base = Awaited<ReturnType<typeof obtenirBase>>;

export async function upsertDepense(db: Base, brute: DepenseBrute): Promise<void> {
  const date = brute.date.slice(0, 10);
  const annulee = brute.annulee ? 1 : 0;
  const existant = await db.getFirstAsync<{ id: string }>("SELECT id FROM depenses WHERE remoteId = ? OR id = ?", [brute.id, brute.id]);
  if (existant) {
    await db.runAsync(
      `UPDATE depenses SET remoteId = ?, departement = ?, date = ?, motif = ?, montant = ?, devise = ?, creeParId = ?, creeParNom = ?,
         annulee = ?, annuleeLe = ?, createdAt = ?, updatedAt = ?, syncVersion = ? WHERE id = ?`,
      [
        brute.id, brute.departement, date, brute.motif, String(brute.montant), brute.devise, brute.creeParId, brute.creeParNom,
        annulee, brute.annuleeLe, brute.createdAt, brute.updatedAt, brute.syncVersion, existant.id,
      ]
    );
  } else {
    await db.runAsync(
      `INSERT INTO depenses (id, remoteId, departement, date, motif, montant, devise, creeParId, creeParNom, annulee, annuleeLe, createdAt, updatedAt, syncVersion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        brute.id, brute.id, brute.departement, date, brute.motif, String(brute.montant), brute.devise, brute.creeParId, brute.creeParNom,
        annulee, brute.annuleeLe, brute.createdAt, brute.updatedAt, brute.syncVersion,
      ]
    );
  }
}

/** Lecture instantanée du miroir (fonctionne hors ligne) : dépenses de la
 * période [du, au] incluse, les plus récentes d'abord. `departement`
 * optionnel (patron) ; le personnel ne reçoit de toute façon que le sien. */
export async function listerDepensesMiroir(du: string, au: string, departement?: DepartementRapport): Promise<DepenseMiroir[]> {
  const db = await obtenirBase();
  const lignes = await db.getAllAsync<LigneDepenseSql>(
    `SELECT id, remoteId, departement, date, motif, montant, devise, creeParNom, annulee, syncVersion FROM depenses
     WHERE date >= ? AND date <= ? ${departement ? "AND departement = ?" : ""}
     ORDER BY date DESC, createdAt DESC`,
    departement ? [du, au, departement] : [du, au]
  );
  return lignes.map((l) => ({ ...l, annulee: l.annulee === 1 }));
}

/** Écriture optimiste : visible instantanément hors ligne ; l'appelant met
 * ensuite l'opération en file avec le `payload` retourné. Le département
 * affiché localement est celui du rôle — le serveur le recalcule de toute
 * façon, il ne lit jamais celui du client. */
export async function creerDepenseLocale(donnees: {
  departement: DepartementRapport;
  date: string;
  motif: string;
  montant: number;
  devise: Devise;
  creeParId: string;
  creeParNom: string;
}): Promise<{ id: string; payload: Record<string, unknown> }> {
  const db = await obtenirBase();
  const id = randomUUID();
  const maintenant = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO depenses (id, remoteId, departement, date, motif, montant, devise, creeParId, creeParNom, annulee, annuleeLe, createdAt, updatedAt, syncVersion)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, 1)`,
    [id, donnees.departement, donnees.date, donnees.motif, String(donnees.montant), donnees.devise, donnees.creeParId, donnees.creeParNom, maintenant, maintenant]
  );
  return { id, payload: { date: donnees.date, motif: donnees.motif, montant: donnees.montant, devise: donnees.devise } };
}

/** Correction ou annulation optimiste — seulement pour une dépense déjà
 * synchronisée (l'UPDATE serveur exige remoteId + baseSyncVersion). */
export async function modifierDepenseLocale(
  depense: DepenseMiroir,
  modifs: { date?: string; motif?: string; montant?: number; devise?: Devise; annulee?: true }
): Promise<Record<string, unknown>> {
  const db = await obtenirBase();
  const maintenant = new Date().toISOString();
  await db.runAsync(
    `UPDATE depenses SET date = ?, motif = ?, montant = ?, devise = ?, annulee = ?, annuleeLe = ?, updatedAt = ? WHERE id = ?`,
    [
      modifs.date ?? depense.date,
      modifs.motif ?? depense.motif,
      modifs.montant !== undefined ? String(modifs.montant) : depense.montant,
      modifs.devise ?? depense.devise,
      modifs.annulee ? 1 : depense.annulee ? 1 : 0,
      modifs.annulee ? maintenant : null,
      maintenant,
      depense.id,
    ]
  );
  const payload: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(modifs)) if (valeur !== undefined) payload[cle] = valeur;
  return payload;
}
