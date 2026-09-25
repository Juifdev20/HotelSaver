import { Devise, ModePaiement, StatutChambre } from "@hotel-chicago/types";
import type { Chambre, Client, Facture, Reservation, VenteCafeteria } from "@hotel-chicago/types";
import { construireRecuFacture } from "./construire-recu";

function creerChambre(surcharge: Partial<Chambre> = {}): Chambre {
  return {
    id: "c1",
    numero: "101",
    type: "Standard",
    prixParNuit: "45",
    devise: Devise.USD,
    statut: StatutChambre.OCCUPEE,
    photos: [],
    updatedAt: new Date().toISOString(),
    syncVersion: 1,
    ...surcharge,
  };
}

function creerClient(surcharge: Partial<Client> = {}): Client {
  return { id: "cl1", nom: "Jean Dupont", telephone: null, email: null, ...surcharge };
}

function creerReservation(surcharge: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
    chambreId: "c1",
    chambre: creerChambre(),
    clientId: "cl1",
    client: creerClient(),
    dateArrivee: "2026-09-20T14:00:00.000Z",
    dateDepart: "2026-09-23T10:00:00.000Z",
    acompte: "0",
    statut: "EN_COURS",
    origine: "SUR_PLACE",
    annuleLe: null,
    motifAnnulation: null,
    facture: null,
    syncVersion: 1,
    ...surcharge,
  };
}

function creerFacture(surcharge: Partial<Facture> = {}): Facture {
  return {
    id: "f1",
    reservationId: "r1",
    montantChambre: "135",
    deviseChambre: Devise.USD,
    montantTotalUSD: "135",
    montantTotalCDF: "0",
    modePaiement: ModePaiement.CASH,
    deviseRegleeParClient: null,
    montantRegleParClient: null,
    tauxChangeApplique: null,
    deviseMonnaieRendue: null,
    montantMonnaieRendue: null,
    numeroRecu: "REC-20260925-0001",
    imprimeLe: null,
    annuleLe: null,
    motifAnnulation: null,
    createdAt: new Date().toISOString(),
    ...surcharge,
  };
}

describe("construireRecuFacture", () => {
  it("n'imprime jamais une ligne de total à zéro", () => {
    const lignes = construireRecuFacture(creerFacture(), creerReservation(), "Alice", []);
    const totaux = lignes.filter((l) => l.type === "montant" && l.libelle.startsWith("TOTAL À PAYER"));
    expect(totaux).toEqual([{ type: "montant", libelle: "TOTAL À PAYER EN USD", valeur: "135.00 $" }]);
  });

  it("calcule le nombre de nuits à partir des dates d'arrivée/départ", () => {
    const lignes = construireRecuFacture(creerFacture(), creerReservation(), "Alice", []);
    const champ = lignes.find((l) => l.type === "champ" && l.label === "Nombre de nuits");
    expect(champ).toEqual({ type: "champ", label: "Nombre de nuits", valeur: "3" });
  });

  it("ajoute une ligne de paiement croisé seulement si présent", () => {
    const sansCroise = construireRecuFacture(creerFacture(), creerReservation(), "Alice", []);
    expect(sansCroise.some((l) => l.type === "montant" && l.libelle.startsWith("Réglé en"))).toBe(false);

    const avecCroise = construireRecuFacture(
      creerFacture({ deviseRegleeParClient: Devise.CDF, montantRegleParClient: "270000" }),
      creerReservation(),
      "Alice",
      []
    );
    expect(avecCroise).toContainEqual({ type: "montant", libelle: "Réglé en CDF", valeur: "270 000 FC" });
  });

  it("liste les consommations cafétaria liées, une ligne par devise non nulle", () => {
    const vente: VenteCafeteria = {
      id: "v1",
      compteId: "cpt1",
      montantTotalUSD: "5",
      montantTotalCDF: "0",
      modePaiement: ModePaiement.FACTURE_CHAMBRE,
      deviseRegleeParClient: null,
      montantRegleParClient: null,
      tauxChangeApplique: null,
      deviseMonnaieRendue: null,
      montantMonnaieRendue: null,
      reservationLieeId: "r1",
      numeroRecu: "CAF-20260925-0002",
      imprimeLe: null,
      annuleLe: null,
      motifAnnulation: null,
      createdAt: new Date().toISOString(),
    };
    const lignes = construireRecuFacture(creerFacture(), creerReservation(), "Alice", [vente]);
    expect(lignes).toContainEqual({ type: "montant", libelle: "Reçu CAF-20260925-0002", valeur: "5.00 $" });
  });
});
