import { Devise, ModePaiement, StatutChambre } from "@hotel-chicago/types";
import type { Chambre, Client, Facture, Reservation, VenteCafeteria } from "@hotel-chicago/types";
import { construireRecuFacture, construireRecuVente, enteteHotel } from "./construire-recu";

const HOTEL = { nom: "Hôtel Test", adresse: "Avenue du Lac 12, Goma", telephone: "+243 970 000 000" };

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
  return {
    id: "cl1",
    nom: "Jean Dupont",
    telephone: null,
    email: null,
    typePiece: null,
    numeroPiece: null,
    notes: null,
    updatedAt: new Date().toISOString(),
    syncVersion: 1,
    ...surcharge,
  };
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
    note: null,
    jetonSuivi: "jeton-test",
    heureArriveePrevue: null,
    demandeClient: null,
    preEnregistreLe: null,
    reponseReception: null,
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
    const lignes = construireRecuFacture(creerFacture(), creerReservation(), "Alice", [], HOTEL);
    const totaux = lignes.filter((l) => l.type === "montant" && l.libelle.startsWith("TOTAL À PAYER"));
    expect(totaux).toEqual([{ type: "montant", libelle: "TOTAL À PAYER EN USD", valeur: "135.00 $" }]);
  });

  it("calcule le nombre de nuits à partir des dates d'arrivée/départ", () => {
    const lignes = construireRecuFacture(creerFacture(), creerReservation(), "Alice", [], HOTEL);
    const champ = lignes.find((l) => l.type === "champ" && l.label === "Nombre de nuits");
    expect(champ).toEqual({ type: "champ", label: "Nombre de nuits", valeur: "3" });
  });

  it("ajoute une ligne de paiement croisé seulement si présent", () => {
    const sansCroise = construireRecuFacture(creerFacture(), creerReservation(), "Alice", [], HOTEL);
    expect(sansCroise.some((l) => l.type === "montant" && l.libelle.startsWith("Réglé en"))).toBe(false);

    const avecCroise = construireRecuFacture(
      creerFacture({ deviseRegleeParClient: Devise.CDF, montantRegleParClient: "270000" }),
      creerReservation(),
      "Alice",
      [],
      HOTEL
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
    const lignes = construireRecuFacture(creerFacture(), creerReservation(), "Alice", [vente], HOTEL);
    expect(lignes).toContainEqual({ type: "montant", libelle: "Reçu CAF-20260925-0002", valeur: "5.00 $" });
  });
});

describe("en-tête du reçu : l'hôtel de l'utilisateur, jamais un nom en dur", () => {
  const texteTitre = (lignes: ReturnType<typeof construireRecuFacture>) => lignes.find((l) => l.type === "titre");

  it("reçu de facturation : nom, adresse et téléphone de l'hôtel fournis", () => {
    const lignes = construireRecuFacture(creerFacture(), creerReservation(), "Alice", [], HOTEL);
    expect(texteTitre(lignes)).toEqual({ type: "titre", texte: "Hôtel Test" });
    expect(lignes).toContainEqual({ type: "soustitre", texte: "Avenue du Lac 12, Goma" });
    expect(lignes).toContainEqual({ type: "soustitre", texte: "Tél. +243 970 000 000" });
    expect(JSON.stringify(lignes)).not.toMatch(/CHICAGO|Kasindi|Congo ya Sika/i);
  });

  it("reçu cafétaria : le nom de l'hôtel puis « - Cafétaria » en ASCII (le « — » s'imprimait « ? »)", () => {
    const vente = { numeroRecu: "V-1", createdAt: "2026-09-20T14:00:00.000Z", montantTotalUSD: "5", montantTotalCDF: "0", modePaiement: ModePaiement.CASH, deviseRegleeParClient: null, montantRegleParClient: null, deviseMonnaieRendue: null, montantMonnaieRendue: null } as unknown as VenteCafeteria;
    const compte = { tableOuNom: "Table 4", sousComptes: [] } as any;
    const lignes = construireRecuVente(vente, compte, "Bob", HOTEL);
    expect(texteTitre(lignes)).toEqual({ type: "titre", texte: "Hôtel Test - Cafétaria" });
    expect(JSON.stringify(lignes)).not.toContain("—");
  });

  it("n'imprime pas de ligne vide quand l'adresse ou le téléphone manquent", () => {
    const lignes = construireRecuFacture(creerFacture(), creerReservation(), "Alice", [], { nom: "Hôtel Test", adresse: null, telephone: "  " });
    expect(lignes.filter((l) => l.type === "soustitre").map((l) => (l as { texte: string }).texte)).toEqual(["Merci de votre visite !"]);
  });

  it("enteteHotel() reprend les coordonnées du profil connecté", () => {
    expect(enteteHotel({ hotelNom: "Hôtel Test", hotelAdresse: "Goma", hotelTelephone: null })).toEqual({ nom: "Hôtel Test", adresse: "Goma", telephone: null });
  });
});

describe("reçu provisoire (établi hors ligne)", () => {
  it("un reçu de séjour TEMP- porte le bandeau PROVISOIRE en haut et la note en bas", () => {
    const lignes = construireRecuFacture(creerFacture({ numeroRecu: "TEMP-AB12-20261010-001" }), creerReservation(), "Marie", [], HOTEL);
    const texte = lignes.map((l: any) => l.texte ?? l.valeur ?? "").join("\n");
    expect(texte).toContain("REÇU PROVISOIRE");
    expect(texte).toContain("TEMP-AB12-20261010-001");
    expect(texte).toContain("Reçu établi hors connexion");
  });
  it("un reçu définitif n'a aucune mention provisoire", () => {
    const lignes = construireRecuFacture(creerFacture(), creerReservation(), "Marie", [], HOTEL);
    expect(JSON.stringify(lignes)).not.toContain("PROVISOIRE");
  });
});
