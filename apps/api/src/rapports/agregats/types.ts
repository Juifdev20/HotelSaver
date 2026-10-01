import { Devise, ModePaiement } from "@hotel-chicago/database";

/** Deux colonnes, jamais fusionnées (section 9.4) — toute agrégation
 * monétaire du rapport garde USD et CDF séparés. */
export interface ParDevise {
  usd: number;
  cdf: number;
}

export interface LigneJour {
  jour: string; // JJ/MM/AAAA
  parDevise: ParDevise;
  nombre: number;
}

export interface AgregatParMode {
  mode: ModePaiement;
  nombre: number;
  parDevise: ParDevise;
}

/** Contrôle « rapport | tableau de bord | écart » par devise (section
 * concordance : le tableau de bord du mois est calculé par les MÊMES
 * fonctions d'agrégation — l'écart est toujours 0 par construction, et le
 * tableau le rend visible au lecteur). */
export interface LigneConcordance {
  libelle: string;
  rapport: ParDevise;
  tableauDeBord: ParDevise;
  ecart: ParDevise;
  conforme: boolean;
}

export interface ProduitTop {
  nom: string;
  categorie: string;
  quantite: number;
  /** Chiffre d'affaires par devise propre au produit. */
  parDevise: ParDevise;
}

export interface AgregatParCategorie {
  categorie: string;
  quantite: number;
  parDevise: ParDevise;
}

export interface AgregatParServeur {
  nom: string;
  nombreVentes: number;
  parDevise: ParDevise;
}

export interface LigneInventaire {
  produit: string;
  categorie: string;
  stockOuverture: number;
  entrees: number;
  sortiesVentes: number;
  pertes: number;
  ajustements: number;
  stockCloture: number;
  valeurCloture: ParDevise; // stockCloture × prix, dans la devise du produit
}

export interface LignePerte {
  produit: string;
  type: string; // PERTE | AJUSTEMENT
  quantite: number;
  motif: string | null;
  date: string;
}

export interface AnnulationVente {
  numeroRecu: string;
  montant: ParDevise;
  motif: string | null;
  date: string;
}

export interface AgregatCafeteria {
  recetteNette: ParDevise;
  nombreVentes: number;
  nombreComptes: number; // comptes distincts ayant produit une vente du mois
  panierMoyen: ParDevise;
  parMode: AgregatParMode[];
  /** Ventes FACTURE_CHAMBRE listées à part : elles figurent déjà dans les
   * factures de la réception (montantTotal inclut les ventes liées). */
  factureChambre: { nombre: number; parDevise: ParDevise };
  parJour: LigneJour[];
  topProduits: ProduitTop[];
  parCategorie: AgregatParCategorie[];
  parServeur: AgregatParServeur[];
  inventaire: LigneInventaire[];
  valeurStockCloture: ParDevise;
  produitsSousSeuil: { produit: string; stock: number; seuil: number }[];
  pertesAjustements: LignePerte[];
  annulations: AnnulationVente[];
}

export interface FactureDetail {
  numeroRecu: string;
  client: string;
  chambre: string;
  sejour: string; // « JJ/MM → JJ/MM »
  montantChambre: number;
  deviseChambre: Devise;
  parDevise: ParDevise; // total facturé (chambre + cafétaria liée)
  modePaiement: ModePaiement;
  monnaieRendue: ParDevise | null;
  date: string;
}

export interface OccupationChambre {
  chambre: string;
  type: string;
  nuitees: number;
  revenu: ParDevise;
}

export interface AgregatReception {
  recetteChambres: ParDevise; // montantChambre seul, par sa devise
  /** Ventes cafétaria facturées sur les séjours, déjà incluses dans les
   * totaux des factures — affichées séparément, jamais re-additionnées. */
  dontCafeteriaLiee: ParDevise;
  nombreFactures: number;
  nuitees: number;
  tauxOccupationPourcent: number;
  dureeMoyenneSejourNuits: number;
  prixMoyenNuitee: ParDevise;
  revenuParChambreDisponible: ParDevise; // RevPAR : recette / (chambres × jours)
  factures: FactureDetail[];
  parMode: AgregatParMode[];
  monnaieRendueTotale: ParDevise;
  occupationParChambre: OccupationChambre[];
  occupationParType: { type: string; nuitees: number; revenu: ParDevise }[];
  demandesSite: { recues: number; confirmees: number; annulees: number };
  origineReservations: { reception: number; sitePublic: number };
  annulationsReservations: { client: string; chambre: string; motif: string | null; date: string }[];
  annulationsRecus: AnnulationVente[];
  sejoursEnCoursFinMois: { client: string; chambre: string; depuis: string; acompte: ParDevise }[];
  acomptesEnCours: ParDevise;
}
