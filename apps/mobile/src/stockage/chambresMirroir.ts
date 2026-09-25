import type { Chambre, StatutChambre } from "@hotel-chicago/types";
import { obtenirBase } from "./sqlite";

interface LigneChambreBrute {
  id: string;
  numero: string;
  type: string;
  prixParNuit: string;
  devise: Chambre["devise"];
  statut: StatutChambre;
  photos: string;
  updatedAt: string;
  syncVersion: number;
}

function depuisLigneBrute(ligne: LigneChambreBrute): Chambre {
  return { ...ligne, photos: JSON.parse(ligne.photos) };
}

/** Lecture instantanée du miroir local — fonctionne hors ligne, jamais un
 * appel réseau (voir EcranChambres.tsx). */
export async function listerChambresMiroir(): Promise<Chambre[]> {
  const db = await obtenirBase();
  const lignes = await db.getAllAsync<LigneChambreBrute>("SELECT * FROM chambres ORDER BY numero ASC", []);
  return lignes.map(depuisLigneBrute);
}

/** Mise à jour optimiste locale (avant confirmation serveur) : seul le
 * statut change, `syncVersion` reste celui déjà connu localement jusqu'à ce
 * que le push confirme le nouveau (voir StockageLocal.confirmerPush) — même
 * principe que l'optimistic update du desktop (EcranChambres.tsx, `changerStatut`). */
export async function ecrireStatutChambreLocal(id: string, statut: StatutChambre): Promise<void> {
  const db = await obtenirBase();
  await db.runAsync("UPDATE chambres SET statut = ? WHERE id = ?", [statut, id]);
}
