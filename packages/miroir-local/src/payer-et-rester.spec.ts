import { MESSAGE_COMPTE_DEJA_FERME, MESSAGE_COMPTE_RESTE_A_PAYER, MESSAGE_COMPTE_RIEN_ENCAISSE } from "@hotel-chicago/regles";
import { Ecritures } from "./ecritures";
import { MagasinDocuments } from "./magasin";
import { PersistanceMemoire } from "./persistance-memoire";
import { StockageDocuments } from "./stockage-documents";
import { Vues } from "./vues";
import type { UtilisateurLocal } from "./contexte";

/** « Il paie maintenant et il reste » + « terminer la table » (11/11/2026), hors ligne : mêmes règles que le serveur. */
async function monter() {
  const magasin = new MagasinDocuments(new PersistanceMemoire());
  await magasin.ouvrir();
  const stockage = new StockageDocuments(magasin);
  const utilisateur: UtilisateurLocal = { userId: "u-caisse", hotelId: "h1", role: "CAFETARIA", nom: "Grace" };
  const ecritures = new Ecritures({ stockage, vues: new Vues(stockage), utilisateur: () => utilisateur, declencher: () => undefined, codePoste: () => "P1", maintenant: () => new Date() });
  await magasin.ecrire("Produit", { id: "p-biere", hotelId: "h1", nom: "Primus", categorie: "Boissons", prix: "3", devise: "USD", typeProduit: "ARTICLE", stockActuel: "50", actif: true, syncVersion: 1 });
  await magasin.ecrire("Produit", { id: "p-coca", hotelId: "h1", nom: "Coca", categorie: "Sodas", prix: "1.5", devise: "USD", typeProduit: "ARTICLE", stockActuel: "50", actif: true, syncVersion: 1 });
  return { ecritures, stockage };
}

/** Table 5 : première part « Première commande » (2 Primus) + part vide « Suite ». */
async function tableAvecPremierePart(e: Ecritures) {
  const compte: any = await e.ouvrirCompteCafeteria({ tableOuNom: "Table 5", nomPremierSousCompte: "Première commande" });
  const premiere = compte.sousComptes[0];
  const suite: any = await e.ajouterSousCompte(compte.id, "Suite");
  await e.ajouterLigne(compte.id, { sousCompteId: premiere.id, produitId: "p-biere", quantite: 2 });
  return { compte, premiere, suite };
}

describe("payer maintenant et rester, hors ligne", () => {
  it("sans gardeOuvert, payer la seule part qui a des lignes ferme le compte (comportement habituel)", async () => {
    const { ecritures, stockage } = await monter();
    const { compte, premiere } = await tableAvecPremierePart(ecritures);
    await ecritures.encaisserCompte(compte.id, { mode: "UNE_PERSONNE", modePaiement: "CASH", sousCompteId: premiere.id });
    expect(stockage.obtenir("CompteCafeteria", compte.id)!.statut).toBe("FERME");
  });

  it("avec gardeOuvert : la part est payée (reçu créé), la table reste OUVERTE, et on peut commander la suite", async () => {
    const { ecritures, stockage } = await monter();
    const { compte, premiere, suite } = await tableAvecPremierePart(ecritures);
    const ventes: any[] = await ecritures.encaisserCompte(compte.id, { mode: "UNE_PERSONNE", modePaiement: "CASH", sousCompteId: premiere.id, gardeOuvert: true });
    expect(ventes).toHaveLength(1);
    expect(stockage.obtenir("SousCompte", premiere.id)!.payeLe).toBeTruthy();
    expect(stockage.obtenir("CompteCafeteria", compte.id)!.statut).toBe("OUVERT");
    // la suite se commande sur la part restée ouverte, pas sur la part payée
    await ecritures.ajouterLigne(compte.id, { sousCompteId: suite.id, produitId: "p-coca", quantite: 1 });
    await expect(ecritures.ajouterLigne(compte.id, { sousCompteId: premiere.id, produitId: "p-coca", quantite: 1 })).rejects.toThrow("a déjà réglé sa part");
    // la gardeOuvert est transmise au serveur dans la file de synchronisation
    const file = await stockage.listerFileAttente();
    const op: any = file.find((o: any) => o.entiteType === "VenteCafeteria");
    expect(op.payload.gardeOuvert).toBe(true);
  });

  it("le dernier encaissement (sans gardeOuvert) ferme la table", async () => {
    const { ecritures, stockage } = await monter();
    const { compte, premiere, suite } = await tableAvecPremierePart(ecritures);
    await ecritures.encaisserCompte(compte.id, { mode: "UNE_PERSONNE", modePaiement: "CASH", sousCompteId: premiere.id, gardeOuvert: true });
    await ecritures.ajouterLigne(compte.id, { sousCompteId: suite.id, produitId: "p-coca", quantite: 2 });
    await ecritures.encaisserCompte(compte.id, { mode: "GROUPE", modePaiement: "CASH" });
    expect(stockage.obtenir("CompteCafeteria", compte.id)!.statut).toBe("FERME");
  });
});

describe("terminer la table, hors ligne", () => {
  it("après un paiement « il reste » et rien d'autre à régler : la table se ferme, action FERMER en file", async () => {
    const { ecritures, stockage } = await monter();
    const { compte, premiere } = await tableAvecPremierePart(ecritures);
    await ecritures.encaisserCompte(compte.id, { mode: "UNE_PERSONNE", modePaiement: "CASH", sousCompteId: premiere.id, gardeOuvert: true });
    const ferme: any = await ecritures.fermerCompte(compte.id);
    expect(ferme.statut).toBe("FERME");
    const action: any = (await stockage.listerFileAttente()).find((o: any) => o.entiteType === "ActionCompte");
    expect(action.payload).toEqual({ compteId: compte.id, action: "FERMER" });
    await expect(ecritures.fermerCompte(compte.id)).rejects.toThrow(MESSAGE_COMPTE_DEJA_FERME);
  });

  it("refusée si rien n'est encaissé (on annule plutôt) ou s'il reste des consommations à régler", async () => {
    const { ecritures } = await monter();
    const { compte, premiere, suite } = await tableAvecPremierePart(ecritures);
    await expect(ecritures.fermerCompte(compte.id)).rejects.toThrow(MESSAGE_COMPTE_RIEN_ENCAISSE);
    await ecritures.encaisserCompte(compte.id, { mode: "UNE_PERSONNE", modePaiement: "CASH", sousCompteId: premiere.id, gardeOuvert: true });
    await ecritures.ajouterLigne(compte.id, { sousCompteId: suite.id, produitId: "p-coca", quantite: 1 });
    await expect(ecritures.fermerCompte(compte.id)).rejects.toThrow(MESSAGE_COMPTE_RESTE_A_PAYER);
  });
});
