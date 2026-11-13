import { ClientHorsLigne } from "./client-hors-ligne";
import { MagasinDocuments } from "./magasin";
import { PersistanceMemoire } from "./persistance-memoire";
import { StockageDocuments } from "./stockage-documents";
import { Vues } from "./vues";
import type { UtilisateurLocal } from "./contexte";

/** Recette du jour hors ligne (13/11/2026) : l'acompte pris à la réception compte, même quand la facture finale est à 0. */
async function monter(utilisateur: UtilisateurLocal) {
  const magasin = new MagasinDocuments(new PersistanceMemoire());
  await magasin.ouvrir();
  const stockage = new StockageDocuments(magasin);
  const maintenant = new Date("2026-11-13T09:00:00Z");
  const ctx = { stockage, vues: new Vues(stockage), utilisateur: () => utilisateur, declencher: () => undefined, codePoste: () => "P1", maintenant: () => maintenant, amorce: () => true };
  const client = new ClientHorsLigne("http://localhost:0", () => null, ctx as any);
  await magasin.ecrire("Chambre", { id: "c1", hotelId: "h1", numero: "101", devise: "USD", prixParNuit: "60", statut: "LIBRE", syncVersion: 1 });
  await magasin.ecrire("Chambre", { id: "c2", hotelId: "h1", numero: "102", devise: "CDF", prixParNuit: "100000", statut: "LIBRE", syncVersion: 1 });
  const reservation = (id: string, extra: Record<string, unknown>) =>
    magasin.ecrire("Reservation", { id, hotelId: "h1", clientId: "cl", statut: "EN_COURS", origine: "RECEPTION", createdBy: "u-recep", annuleLe: null, syncVersion: 1, ...extra });
  return { client, reservation, stockage };
}

const recep: UtilisateurLocal = { userId: "u-recep", hotelId: "h1", role: "RECEPTIONNISTE", nom: "Rita" };
const patron: UtilisateurLocal = { userId: "u-patron", hotelId: "h1", role: "PATRON", nom: "Paul" };

describe("recette du jour : acomptes, hors ligne", () => {
  it("un séjour de 180 $ payé d'avance apparaît dans « Vos encaissements » de la réception (capture du 13/11)", async () => {
    const { client, reservation } = await monter(recep);
    await reservation("r1", { chambreId: "c1", acompte: "180", createdAt: "2026-11-13T08:00:00.000Z" });
    const r = await client.recetteDuJour();
    expect(r.chambres).toEqual({ montantUSD: 180, montantCDF: 0 });
    const j = await client.journeeReception();
    expect(j.recette.chambres.montantUSD).toBe(180);
    expect(j.recette.total.montantUSD).toBe(180);
  });

  it("chaque réceptionniste ne voit que ses acomptes ; le patron voit ceux de tout le monde, par devise", async () => {
    const recepSeule = await monter(recep);
    for (const m of [recepSeule]) {
      await m.reservation("r1", { chambreId: "c1", acompte: "100", createdAt: "2026-11-13T08:00:00.000Z" });
      await m.reservation("r2", { chambreId: "c1", acompte: "40", createdBy: "u-autre", createdAt: "2026-11-13T08:30:00.000Z" });
      await m.reservation("r3", { chambreId: "c2", acompte: "50000", createdBy: "u-autre", createdAt: "2026-11-13T08:45:00.000Z" });
    }
    expect((await recepSeule.client.recetteDuJour()).chambres).toEqual({ montantUSD: 100, montantCDF: 0 });
    const leur = await monter(patron);
    await leur.reservation("r1", { chambreId: "c1", acompte: "100", createdAt: "2026-11-13T08:00:00.000Z" });
    await leur.reservation("r2", { chambreId: "c1", acompte: "40", createdBy: "u-autre", createdAt: "2026-11-13T08:30:00.000Z" });
    await leur.reservation("r3", { chambreId: "c2", acompte: "50000", createdBy: "u-autre", createdAt: "2026-11-13T08:45:00.000Z" });
    expect((await leur.client.recetteDuJour()).chambres).toEqual({ montantUSD: 140, montantCDF: 50000 });
  });

  it("ignore un autre jour, une réservation annulée et un acompte payé en ligne", async () => {
    const { client, reservation } = await monter(patron);
    await reservation("r1", { chambreId: "c1", acompte: "100", createdAt: "2026-11-12T08:00:00.000Z" });
    await reservation("r2", { chambreId: "c1", acompte: "100", statut: "ANNULEE", annuleLe: "2026-11-13T08:10:00.000Z", createdAt: "2026-11-13T08:00:00.000Z" });
    await reservation("r3", { chambreId: "c1", acompte: "100", origine: "SITE_PUBLIC", createdAt: "2026-11-13T08:00:00.000Z" });
    expect((await client.recetteDuJour()).chambres).toEqual({ montantUSD: 0, montantCDF: 0 });
  });
});
