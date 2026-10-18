import { MESSAGE_COMPTE_ANNULE, MESSAGE_COMPTE_DEJA_ENCAISSE } from "@hotel-chicago/regles";
import { Ecritures } from "./ecritures";
import { MagasinDocuments } from "./magasin";
import { PersistanceMemoire } from "./persistance-memoire";
import { StockageDocuments } from "./stockage-documents";
import { Vues } from "./vues";
import type { UtilisateurLocal } from "./contexte";

/** Annulation hors ligne d'un compte cafétaria créé par erreur (19/10/2026) : mêmes règles et messages que le serveur. */
async function monter() {
  const magasin = new MagasinDocuments(new PersistanceMemoire());
  await magasin.ouvrir();
  const stockage = new StockageDocuments(magasin);
  const utilisateur: UtilisateurLocal = { userId: "u-caisse", hotelId: "h1", role: "CAFETARIA", nom: "Grace" };
  const ecritures = new Ecritures({ stockage, vues: new Vues(stockage), utilisateur: () => utilisateur, declencher: () => undefined, codePoste: () => "P1", maintenant: () => new Date() });
  await magasin.ecrire("Produit", { id: "p-biere", hotelId: "h1", nom: "Primus", categorie: "Boissons", prix: "2", devise: "USD", typeProduit: "ARTICLE", stockActuel: "10", actif: true, syncVersion: 1 });
  return { ecritures, stockage, magasin };
}

describe("annulation d'un compte, hors ligne", () => {
  it("compte avec consommations : ANNULE, stock local rendu, action ActionCompte en file", async () => {
    const { ecritures, stockage } = await monter();
    const compte: any = await ecritures.ouvrirCompteCafeteria({ tableOuNom: "Table 4" });
    const sc = compte.sousComptes[0];
    await ecritures.ajouterLigne(compte.id, { sousCompteId: sc.id, produitId: "p-biere", quantite: 3 });
    expect(stockage.obtenir("Produit", "p-biere")!.stockActuel).toBe("7");

    const annule: any = await ecritures.annulerCompte(compte.id, "Erreur");
    expect(annule.statut).toBe("ANNULE");
    expect(stockage.obtenir("Produit", "p-biere")!.stockActuel).toBe("10");
    const file = await stockage.listerFileAttente();
    const action = file.find((o: any) => o.entiteType === "ActionCompte");
    expect(action?.payload).toEqual({ compteId: compte.id, action: "ANNULER", motif: "Erreur" });
  });

  it("deuxième annulation, ou ajout sur un compte annulé : message du serveur", async () => {
    const { ecritures } = await monter();
    const compte: any = await ecritures.ouvrirCompteCafeteria({ tableOuNom: "Comptoir 10:00" });
    await ecritures.annulerCompte(compte.id);
    await expect(ecritures.annulerCompte(compte.id)).rejects.toThrow(MESSAGE_COMPTE_ANNULE);
    await expect(ecritures.ajouterLigne(compte.id, { sousCompteId: compte.sousComptes[0].id, produitId: "p-biere", quantite: 1 })).rejects.toThrow(MESSAGE_COMPTE_ANNULE);
  });

  it("une part déjà payée : annulation refusée (il faut annuler le reçu)", async () => {
    const { ecritures, magasin, stockage } = await monter();
    const compte: any = await ecritures.ouvrirCompteCafeteria({ tableOuNom: "Table 2" });
    const sc = stockage.obtenir("SousCompte", compte.sousComptes[0].id)!;
    await magasin.ecrire("SousCompte", { ...sc, payeLe: new Date().toISOString() });
    await expect(ecritures.annulerCompte(compte.id)).rejects.toThrow(MESSAGE_COMPTE_DEJA_ENCAISSE);
  });
});
