import { MESSAGE_MOUVEMENT_RESERVE_PATRON } from "@hotel-chicago/regles";
import { Ecritures } from "./ecritures";
import { MagasinDocuments } from "./magasin";
import { PersistanceMemoire } from "./persistance-memoire";
import { StockageDocuments } from "./stockage-documents";
import { Vues } from "./vues";
import type { UtilisateurLocal } from "./contexte";

/** Hors ligne : même règle que le serveur — la caisse ne saisit que des ENTRÉES (18/10/2026). */
async function monter(role: string) {
  const magasin = new MagasinDocuments(new PersistanceMemoire());
  await magasin.ouvrir();
  const stockage = new StockageDocuments(magasin);
  const utilisateur: UtilisateurLocal = { userId: "u1", hotelId: "h1", role, nom: "Grace" };
  const ecritures = new Ecritures({ stockage, vues: new Vues(stockage), utilisateur: () => utilisateur, declencher: () => undefined, codePoste: () => "P1", maintenant: () => new Date() });
  await magasin.ecrire("Produit", { id: "p-biere", hotelId: "h1", nom: "Primus", categorie: "Boissons", prix: "2", devise: "USD", typeProduit: "ARTICLE", stockActuel: "10", actif: true, syncVersion: 1 });
  return { ecritures, stockage };
}

describe("mouvements de stock manuels, hors ligne", () => {
  it("caisse : entrée acceptée, perte et ajustement refusés avec le message du serveur", async () => {
    const { ecritures, stockage } = await monter("CAFETARIA");
    await ecritures.creerMouvementStock({ produitId: "p-biere", type: "ENTREE", quantite: 5 });
    expect(stockage.obtenir("Produit", "p-biere")!.stockActuel).toBe("15");
    for (const type of ["PERTE", "AJUSTEMENT"] as const) {
      await expect(ecritures.creerMouvementStock({ produitId: "p-biere", type, quantite: 1 })).rejects.toThrow(MESSAGE_MOUVEMENT_RESERVE_PATRON);
    }
    expect(stockage.obtenir("Produit", "p-biere")!.stockActuel).toBe("15");
  });

  it("patron : perte acceptée", async () => {
    const { ecritures, stockage } = await monter("PATRON");
    await ecritures.creerMouvementStock({ produitId: "p-biere", type: "PERTE", quantite: 2 });
    expect(stockage.obtenir("Produit", "p-biere")!.stockActuel).toBe("8");
  });
});
