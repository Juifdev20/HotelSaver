import { messagePlafondEssai } from "@hotel-chicago/regles";
import { Ecritures } from "./ecritures";
import { MagasinDocuments } from "./magasin";
import { PersistanceMemoire } from "./persistance-memoire";
import { StockageDocuments } from "./stockage-documents";
import { Vues } from "./vues";
import type { UtilisateurLocal } from "./contexte";

/** Plafonds de l'essai gratuit HORS LIGNE (18/10/2026) : mêmes limites et mêmes messages que le serveur. */
async function ecritures(abonnement: UtilisateurLocal["abonnement"]) {
  const magasin = new MagasinDocuments(new PersistanceMemoire());
  await magasin.ouvrir();
  const stockage = new StockageDocuments(magasin);
  const utilisateur: UtilisateurLocal = { userId: "u1", hotelId: "h1", role: "PATRON", nom: "Patron", abonnement };
  return new Ecritures({ stockage, vues: new Vues(stockage), utilisateur: () => utilisateur, declencher: () => undefined, codePoste: () => "P1", maintenant: () => new Date() });
}

const chambre = (numero: string) => ({ numero, type: "Standard", prixParNuit: 45, devise: "USD" });
const produit = (nom: string) => ({ nom, categorie: "Boissons", prix: 2, devise: "USD" });

describe("plafonds de l'essai gratuit, hors ligne", () => {
  it("chambres : la (N+1)e est refusée avec le message du serveur", async () => {
    const e = await ecritures({ plafondsEssai: { chambres: 2, produits: 50, photosGalerie: 6 } });
    await e.creerChambre(chambre("101"));
    await e.creerChambre(chambre("102"));
    await expect(e.creerChambre(chambre("103"))).rejects.toThrow(messagePlafondEssai.chambres(2));
  });

  it("produits : le (N+1)e est refusé avec le message du serveur", async () => {
    const e = await ecritures({ plafondsEssai: { chambres: 10, produits: 1, photosGalerie: 6 } });
    await e.creerProduit(produit("Eau"));
    await expect(e.creerProduit(produit("Primus"))).rejects.toThrow(messagePlafondEssai.produits(1));
  });

  it("hôtel qui a payé (pas de plafond d'essai) ou profil ancien sans abonnement : aucune limite ajoutée", async () => {
    for (const abonnement of [{ plafondsEssai: null }, undefined]) {
      const e = await ecritures(abonnement);
      for (const n of ["101", "102", "103"]) await e.creerChambre(chambre(n));
    }
  });
});
