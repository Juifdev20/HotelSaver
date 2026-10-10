import { MagasinDocuments } from "./magasin";
import { PersistanceMemoire } from "./persistance-memoire";
import { StockageDocuments } from "./stockage-documents";
import { Vues } from "./vues";

describe("gros hôtel : les listes restent instantanées", () => {
  it("20 000 réservations, 15 000 factures, 3 000 clients : listes en moins d'une seconde", async () => {
    const magasin = new MagasinDocuments(new PersistanceMemoire());
    await magasin.ouvrir();
    const stockage = new StockageDocuments(magasin);
    const ops: any[] = [];
    for (let c = 0; c < 50; c++) ops.push({ type: "ecrire", collection: "Chambre", id: `c${c}`, valeur: { id: `c${c}`, numero: String(c) } });
    for (let i = 0; i < 3000; i++) ops.push({ type: "ecrire", collection: "Client", id: `cl${i}`, valeur: { id: `cl${i}`, nom: `Client ${i}` } });
    for (let i = 0; i < 20000; i++) {
      ops.push({ type: "ecrire", collection: "Reservation", id: `r${i}`, valeur: { id: `r${i}`, chambreId: `c${i % 50}`, clientId: `cl${i % 3000}`, dateArrivee: new Date(2024, 0, 1 + (i % 700)).toISOString(), dateDepart: "x", statut: "TERMINEE" } });
      if (i < 15000) ops.push({ type: "ecrire", collection: "Facture", id: `f${i}`, valeur: { id: `f${i}`, reservationId: `r${i}`, numeroRecu: `REC-${i}` } });
    }
    await magasin.appliquer(ops);
    const vues = new Vues(stockage);
    const t0 = Date.now();
    expect(vues.reservations()).toHaveLength(20000);
    expect(vues.clientsAvecSejours(stockage.lister("Client"))).toHaveLength(3000);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
