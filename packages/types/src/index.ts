// Types partagés — minimal en Phase 1 (juste ce qu'il faut pour l'Auth/RBAC).
// Complété au fur et à mesure des Phases 2+ avec les DTO métier
// (Chambres, Réservations, Cafétaria...).

/** Doit rester synchronisé avec l'enum `Role` de packages/database/prisma/schema.prisma */
export enum Role {
  RECEPTIONNISTE = "RECEPTIONNISTE",
  CAFETARIA = "CAFETARIA",
  PATRON = "PATRON",
}

/** Doit rester synchronisé avec l'enum `Devise` de packages/database/prisma/schema.prisma */
export enum Devise {
  USD = "USD",
  CDF = "CDF",
}

/** Doit rester synchronisé avec l'enum `TypeProduit` de schema.prisma :
 * PLAT = préparé (cuisine/site, sans stock compté) ; ARTICLE = comptoir
 * (stocké, servi directement). */
export enum TypeProduit {
  ARTICLE = "ARTICLE",
  PLAT = "PLAT",
}

/** Utilisateur authentifié attaché à la requête par le AuthGuard (apps/api). */
export interface UtilisateurAuthentifie {
  /** Utilisateur.id (Prisma), pas le supabaseAuthId brut */
  userId: string;
  supabaseAuthId: string;
  role: Role;
  nom: string;
  hotelId: string;
  /** Réglage de l'hôtel (séparation des tâches) : le patron peut-il aussi réaliser les opérations du
   * quotidien ? Absent/false = non. Lire via `peutOperer`, jamais directement. */
  patronPeutOperer?: boolean;
  /** Réglage de l'hôtel : file de production cuisine active (EN_ATTENTE → SERVI, écran Cuisine,
   * badges sur les comptes) ? Absent/false = vente au comptoir, lignes créées directement SERVI. */
  cuisineActivee?: boolean;
  /** Réglage de l'hôtel : les clients peuvent commander depuis le site public
   * (onglet « Cuisine » du site, POST /public/commande). Absent/false = canal fermé. */
  commandeWebActivee?: boolean;
  /** Fonctions ouvertes à l'hôtel (RECEPTION, CAFETERIA, SITE_PUBLIC, DOMAINE_PERSONNALISE, ACOMPTE_EN_LIGNE) selon sa formule : les
   * applications masquent les écrans des autres, le serveur les refuse de toute façon (403 FONCTION_NON_INCLUSE). Absent = tout (anciens profils). */
  fonctions?: string[];
}

/**
 * Séparation des tâches : réserver, faire un check-in/out, facturer un séjour, ouvrir/alimenter/encaisser
 * un compte cafétaria sont réservés au personnel concerné (réception, cafétaria). Le patron ne le fait
 * que si l'hôtel l'a explicitement autorisé (`patronPeutOperer`). UNE seule règle, partagée par l'API
 * (verrou serveur) et les apps (boutons masqués).
 */
export function peutOperer(utilisateur: { role: Role; patronPeutOperer?: boolean }): boolean {
  return utilisateur.role !== Role.PATRON || utilisateur.patronPeutOperer === true;
}

/** Réponse de GET /auth/me : l'utilisateur + l'hôtel auquel il appartient (affichés dans les
 * apps : jamais un nom d'hôtel codé en dur). `hotelSlogan` = celui défini par le patron. */
export interface ProfilConnecte extends UtilisateurAuthentifie {
  hotelNom: string;
  /** Statut de la licence de l'hôtel au moment de la réponse (copié dans le profil mémorisé pour le mode hors ligne). */
  statutLicence?: string;
  /** Fin de validité de la licence (ISO), calculée côté serveur — informatif hors ligne. */
  licenceValideJusquau?: string | null;
  /** État de l'abonnement au moment de la réponse (essai, actif, délai de grâce, expiré…) : source de vérité pour afficher les alertes et le blocage. */
  abonnement?: EtatAbonnement;
  hotelSlogan: string | null;
  /** Adresse et téléphone de l'hôtel : imprimés dans l'en-tête des reçus. */
  hotelAdresse: string | null;
  hotelTelephone: string | null;
  /** Adresse du site public de l'hôtel (domaine personnalisé vérifié, sinon
   * `SITE_WEB_URL/?hotel=<sousDomaine>`) — base du lien de suivi client. */
  hotelUrlSite: string;
}

/** Super-admin authentifié attaché à la requête par SuperAdminAuthGuard
 * (apps/api) — indépendant de tout hôtel, voir SuperAdmin dans le schéma
 * Prisma et DECISIONS.md (Phase 3). */
export interface SuperAdminAuthentifie {
  id: string;
  supabaseAuthId: string;
  nom: string;
}

/** Doit rester synchronisé avec l'enum `StatutChambre` du schéma Prisma. */
export enum StatutChambre {
  LIBRE = "LIBRE",
  OCCUPEE = "OCCUPEE",
  RESERVEE = "RESERVEE",
  NETTOYAGE = "NETTOYAGE",
}

/**
 * Forme d'une Chambre telle que sérialisée par l'API (JSON) — pas le type
 * Prisma lui-même : les apps clientes (Electron, mobile, futur site) ne
 * doivent jamais dépendre de @hotel-chicago/database. `prixParNuit` est une
 * chaîne : Prisma sérialise ses champs Decimal en JSON via leur `toJSON()`
 * (qui renvoie une chaîne), jamais un `number` — à parser explicitement
 * (`Number(...)`) avant tout calcul côté client.
 */
export interface Chambre {
  id: string;
  numero: string;
  type: string;
  prixParNuit: string;
  devise: Devise;
  statut: StatutChambre;
  photos: string[];
  updatedAt: string;
  syncVersion: number;
}

/** Disponibilité d'une chambre sur le site public pour la période demandée. RESERVEE = déjà prise (acompte payé ou réservation confirmée). */
export type DisponibiliteChambrePublique = "DISPONIBLE" | "RESERVEE" | "EN_COURS_DE_PAIEMENT";

/** Une chambre telle que le site public la montre : seulement ce qui est public, plus sa disponibilité. */
export interface ChambrePublique {
  id: string;
  numero: string;
  type: string;
  prixParNuit: string;
  devise: Devise;
  photos: string[];
  disponibilite: DisponibiliteChambrePublique;
  /** Sans dates choisies : premier jour où une chambre prise redevient libre (AAAA-MM-JJ) ; sinon null. */
  libreLe: string | null;
}

/** Forme JSON d'un Produit (Decimal → string, voir Chambre). */
export interface Produit {
  id: string;
  nom: string;
  categorie: string;
  prix: string;
  devise: Devise;
  /** Plat préparé ou article de comptoir stocké (défaut ARTICLE). */
  typeProduit: TypeProduit;
  photo: string | null;
  stockActuel: string;
  seuilAlerte: string;
  prixAchat?: string;   // Decimal → string, facultatif — prix d'acquisition pour le calcul de marge
  actif: boolean;
  /** Opt-in site public : visible et commandable sur la page « Cuisine » du site
   * (si l'hôtel a activé commandeWebActivee). */
  commandableEnLigne: boolean;
  /** Description affichée sur la page publique (facultative). */
  description?: string | null;
  /** PLAT : portions préparées restantes ; null/absent = illimité (cuisine à
   * la commande). Décrémenté à la vente ; 0 = « Épuisé ». */
  portionsDisponibles?: number | null;
  /** ARTICLE : code-barres du fabricant ou EAN-13 interne (préfixe 2) —
   * l'identifiant seul, jamais le prix. null = pas de code. */
  codeBarres?: string | null;
  /** Présents en base (comme Chambre) mais absents jusqu'ici de ce type —
   * ajoutés pour le miroir hors ligne Cafétaria (Phase 6, 26/09/2026), voir
   * apps/mobile/src/stockage/stockageLocalMobile.ts. */
  updatedAt: string;
  syncVersion: number;
}

/** Deux montants séparés, jamais fusionnés (section 9.4). */
export interface MontantsParDevise {
  montantUSD: number;
  montantCDF: number;
}

/** GET /dashboard/recette-du-jour — `chambres`/`cafeteria` absents selon le rôle. */
export interface RecetteDuJour {
  chambres?: MontantsParDevise;
  cafeteria?: MontantsParDevise;
  total: MontantsParDevise;
}

/** GET /dashboard/occupation */
export interface Occupation {
  total: number;
  libres: number;
  occupees: number;
  reservees: number;
  enNettoyage: number;
  tauxOccupationPourcent: number;
}

/** Une ligne de GET /dashboard/ventes-recentes, côté chambres (encaissement d'un séjour). */
export interface FactureRecente {
  id: string;
  numeroRecu: string;
  createdAt: string;
  annuleLe: string | null;
  montantTotalUSD: string;
  montantTotalCDF: string;
  reservation: {
    chambre: { numero: string };
    client: { nom: string };
  };
}

/** Une ligne de GET /dashboard/ventes-recentes, côté cafétaria. */
export interface VenteCafeteriaRecente {
  id: string;
  numeroRecu: string;
  createdAt: string;
  annuleLe: string | null;
  montantTotalUSD: string;
  montantTotalCDF: string;
}

/** GET /dashboard/ventes-recentes — les deux listes triées par date décroissante,
 * `factures`/`ventesCafeteria` vides (jamais absentes) selon le rôle. */
export interface VentesRecentes {
  factures: FactureRecente[];
  ventesCafeteria: VenteCafeteriaRecente[];
}

/** Doit rester synchronisé avec l'enum `StatutCompte` du schéma Prisma. */
export enum StatutCompte {
  OUVERT = "OUVERT",
  FERME = "FERME",
  /** Créé par erreur et annulé, jamais encaissé (19/10/2026). */
  ANNULE = "ANNULE",
}

/** Doit rester synchronisé avec l'enum `ModePaiement` du schéma Prisma. */
export enum ModePaiement {
  CASH = "CASH",
  MOBILE_MONEY = "MOBILE_MONEY",
  FACTURE_CHAMBRE = "FACTURE_CHAMBRE",
}

/** Doit rester synchronisé avec apps/api/src/cafeteria/dto/encaisser-compte.dto.ts
 * (pas un enum Prisma — un champ libre côté service). */
export const MODES_ENCAISSEMENT = ["GROUPE", "PAR_SOUS_COMPTE", "PARTAGE_EGAL"] as const;
export type ModeEncaissement = (typeof MODES_ENCAISSEMENT)[number];

/** Doit rester synchronisé avec l'enum `StatutLigne` du schéma Prisma. */
export enum StatutLigne {
  EN_ATTENTE    = "EN_ATTENTE",
  EN_PREPARATION = "EN_PREPARATION",
  PRET          = "PRET",
  SERVI         = "SERVI",
}

/** Libellés courts affichés dans les badges de statut cuisine. */
export const LIBELLE_STATUT_LIGNE: Record<StatutLigne, string> = {
  EN_ATTENTE:     "En attente",
  EN_PREPARATION: "En préparation",
  PRET:           "Prêt",
  SERVI:          "Servi",
};

/** Forme JSON d'une LigneCommande (Decimal → string, voir Chambre), avec le
 * produit inclus (voir INCLUDE_COMPTE_COMPLET côté API). */
export interface LigneCommande {
  id: string;
  sousCompteId: string;
  produitId: string;
  quantite: string;
  prixUnitaire: string;
  devise: Devise;
  statut: StatutLigne;
  prisEnChargeA: string | null;
  pretA: string | null;
  note: string | null;
  produit: Produit;
}

// ---------------------------------------------------------------------------
// Menu du jour
// ---------------------------------------------------------------------------

/** Un item du menu du jour avec son prix spécial optionnel. */
export interface MenuDuJourItem {
  id: string;
  menuId: string;
  produitId: string;
  prixSpecial: string | null;   // null = prix catalogue
  deviseSpeciale: Devise | null;
  produit: Produit;
}

/** Menu du jour d'un hôtel pour une date donnée. */
export interface MenuDuJour {
  id: string;
  hotelId: string;
  date: string; // "YYYY-MM-DD"
  actif: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: MenuDuJourItem[];
}

export interface SousCompte {
  id: string;
  compteId: string;
  nom: string;
  /** Date de règlement de SA part (encaissement par personne) ; null = pas encore payé. */
  payeLe?: string | null;
  lignes: LigneCommande[];
}

/** Forme JSON d'une VenteCafeteria (Decimal → string, voir Chambre). */
export interface VenteCafeteria {
  id: string;
  compteId: string;
  /** Renseigné pour un reçu individuel (encaissement d'une seule personne). */
  sousCompteId?: string | null;
  montantTotalUSD: string;
  montantTotalCDF: string;
  modePaiement: ModePaiement;
  deviseRegleeParClient: Devise | null;
  montantRegleParClient: string | null;
  tauxChangeApplique: string | null;
  deviseMonnaieRendue: Devise | null;
  montantMonnaieRendue: string | null;
  reservationLieeId: string | null;
  numeroRecu: string;
  imprimeLe: string | null;
  annuleLe: string | null;
  motifAnnulation: string | null;
  createdAt: string;
}

/** Forme JSON d'un CompteCafeteria, avec sous-comptes/lignes/ventes inclus
 * (voir INCLUDE_COMPTE_COMPLET dans apps/api/src/cafeteria/cafeteria.service.ts). */
export interface CompteCafeteria {
  id: string;
  tableOuNom: string;
  statut: StatutCompte;
  /** "SITE_PUBLIC" = commande passée sur le site web public ; null = comptoir. */
  origine?: string | null;
  /** Téléphone / chambre du client web, pour l'identifier au comptoir. */
  contactClient?: string | null;
  /** Instruction globale saisie par le client web (ex. « sans piment »). */
  noteClient?: string | null;
  ouvertPar: string;
  ouvertLe: string;
  fermeLe: string | null;
  /** Compte annulé (créé par erreur) : quand, par qui (Utilisateur.id), pourquoi. */
  annuleLe?: string | null;
  annulePar?: string | null;
  motifAnnulation?: string | null;
  syncVersion: number;
  sousComptes: SousCompte[];
  ventes: VenteCafeteria[];
}

/** Forme JSON d'un MouvementStock (Decimal → string, voir Chambre), avec le
 * produit inclus. */
export interface MouvementStock {
  id: string;
  produitId: string;
  quantite: string;
  type: string;
  motif: string | null;
  createdBy: string;
  createdAt: string;
  produit: Produit;
}

/** Données d'un produit retournées par GET /stock/inventaire/preparer :
 *  stock théorique reconstitué + détail des mouvements sur la période. */
export interface LignePreparationInventaire {
  produitId: string;
  nom: string;
  categorie: string;
  prix: string;
  devise: Devise;
  prixAchat?: string;
  stockActuel: string;
  stockTheorique: number;
  entrees: number;
  sortiesVentes: number;
  pertes: number;
  ajustements: number;
}

export interface InventairePhysiqueItem {
  id: string;
  produitId: string;
  produit: { nom: string; categorie: string; prix: string; devise: Devise; prixAchat?: string };
  stockTheorique: string;
  stockPhysique: string;
  ecart: string;
  note: string | null;
}

export interface InventairePhysique {
  id: string;
  dateDebut: string;
  dateFin: string;
  titre: string | null;
  createdBy: string;
  createdAt: string;
  pdfUrl: string | null;
  items: InventairePhysiqueItem[];
}

export const STATUTS_RESERVATION = ["EN_ATTENTE", "CONFIRMEE", "EN_COURS", "TERMINEE", "ANNULEE"] as const;
export type StatutReservation = (typeof STATUTS_RESERVATION)[number];

export interface Client {
  id: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  /** Registre de police / fidélisation — fiche client complète. */
  typePiece: string | null;
  numeroPiece: string | null;
  notes: string | null;
  /** Présents en base depuis la Phase 16 (pull /sync/pull + miroir local) —
   * jamais renseignés dans le payload `client` inline de création. */
  updatedAt: string;
  syncVersion: number;
}

/** Forme JSON d'une Facture (Decimal → string, voir Chambre). */
export interface Facture {
  id: string;
  reservationId: string;
  montantChambre: string;
  deviseChambre: Devise;
  montantTotalUSD: string;
  montantTotalCDF: string;
  modePaiement: ModePaiement;
  deviseRegleeParClient: Devise | null;
  montantRegleParClient: string | null;
  tauxChangeApplique: string | null;
  deviseMonnaieRendue: Devise | null;
  montantMonnaieRendue: string | null;
  numeroRecu: string;
  imprimeLe: string | null;
  annuleLe: string | null;
  motifAnnulation: string | null;
  /** Qui a encaissé (Utilisateur.id), 19/10/2026 ; null pour une ancienne facture non reprise. */
  createdBy?: string | null;
  createdAt: string;
}

/** Forme JSON d'une Reservation, avec chambre/client/facture inclus (voir
 * `include` de ReservationsController — findAll/findOne les incluent
 * toujours). `facture` est `null` tant que le séjour n'est pas facturé. */
export interface Reservation {
  id: string;
  chambreId: string;
  chambre: Chambre;
  clientId: string;
  client: Client;
  dateArrivee: string;
  dateDepart: string;
  acompte: string;
  statut: StatutReservation;
  origine: string;
  /** Demandes spéciales du client (lit bébé, étage…) affichées à l'arrivée. */
  note: string | null;
  /** Secret du lien « Ma réservation » envoyé au client (voir `lienSuivi`). */
  jetonSuivi: string;
  /** Pré-enregistrement en ligne par le client : « HH:MM », texte libre, date. */
  heureArriveePrevue: string | null;
  demandeClient: string | null;
  preEnregistreLe: string | null;
  /** Heures RÉELLES de check-in / check-out (null = pas encore fait, ou
   * séjour enregistré avant le 15/10/2026). */
  arriveeLe?: string | null;
  departLe?: string | null;
  /** Message de la réception visible par le client sur sa page de suivi. */
  reponseReception: string | null;
  annuleLe: string | null;
  motifAnnulation: string | null;
  facture: Facture | null;
  syncVersion: number;
}

/** Corps de POST /public/hotels/inscription (Phase 4) — inscription en
 * libre-service, toujours statutLicence = ESSAI côté serveur. */
export interface InscriptionHotelPayload {
  nom: string;
  sousDomaine: string;
  nomProprietaire: string;
  /** Numéro du patron, identifiant de connexion (15/10/2026) — normalisé « +243XXXXXXXXX ». */
  telephoneProprietaire: string;
  /** Optionnel depuis le 15/10/2026 : sert seulement à « mot de passe oublié ». */
  email?: string;
  motDePasse: string;
  telephoneContact?: string;
  adresse?: string;
  logoUrl?: string;
  /** Version des conditions d'utilisation acceptée (case cochée) — obligatoire depuis le 19/10/2026. */
  conditionsVersion?: number;
}

/** Conditions d'utilisation en vigueur (GET /public/conditions), 19/10/2026. */
export interface ConditionsUtilisationPubliques {
  version: number;
  texte: string;
  publieLe: string;
}

/** Doit rester synchronisé avec l'enum `StatutLicence` du schéma Prisma. */
export enum StatutLicence {
  ESSAI = "ESSAI",
  ACTIF = "ACTIF",
  SUSPENDU = "SUSPENDU",
  RESILIE = "RESILIE",
}

/** Réponse de POST /public/hotels/inscription — l'Hotel créé, avec sa charte
 * graphique (générique ou dérivée d'un logo, voir Phase 5). */
export interface HotelCree {
  id: string;
  /** Inscription seulement : false = ce numéro avait déjà eu un essai gratuit — l'hôtel est créé mais doit payer pour s'ouvrir. */
  essaiGratuit?: boolean;
  nom: string;
  sousDomaine: string;
  statutLicence: StatutLicence;
  emailContact: string | null;
  telephoneContact: string | null;
  adresse: string | null;
  // Domaine personnalisé (Phase 13) — voir apps/api/src/super-admin/render-domains.service.ts.
  domainePersonnalise: string | null;
  domaineVerifie: boolean;
  createdAt: string;
  updatedAt: string;
  branding: {
    id: string;
    hotelId: string;
    logoUrl: string | null;
    policeAffichage: string;
    policeCorps: string;
    policeMono: string;
    palette: unknown;
    createdAt: string;
    updatedAt: string;
  };
}

/** Corps de POST /public/reservations (Phase 9 : sousDomaine ajouté pour la
 * résolution de tenant — voir DECISIONS.md). */
export interface DemandeReservationPayload {
  sousDomaine: string;
  chambreId: string;
  client: {
    nom: string;
    telephone?: string;
    email?: string;
  };
  dateArrivee: string;
  dateDepart: string;
  /** Jeton du widget anti-robot (Turnstile), exigé par le serveur quand un CAPTCHA est configuré. */
  captchaToken?: string;
}

/** POST /public/commande — commande passée par un client depuis le site public
 * de l'hôtel (onglet « Cuisine »). Les prix sont TOUJOURS repris côté serveur :
 * le payload ne transporte que produitId + quantite (+ note de préparation). */
export interface CommandeWebPayload {
  sousDomaine: string;
  /** Jeton du widget anti-robot (Turnstile), exigé par le serveur quand un CAPTCHA est configuré. */
  captchaToken?: string;
  client: {
    nom: string;
    /** Téléphone/WhatsApp pour identifier le client au comptoir. */
    telephone?: string;
    /** N° de chambre si le client est un invité de l'hôtel (facultatif). */
    chambre?: string;
    /** Instruction globale (ex. « sans piment »). */
    note?: string;
  };
  lignes: {
    produitId: string;
    quantite: number;
    /** Instruction propre à l'article (ex. « bien cuit »). */
    note?: string;
  }[];
}

/** Réponse de POST /public/commande — confirmation affichée au client :
 * référence courte à présenter au comptoir + total calculé côté serveur. */
export interface CommandeWebCreee {
  compteId: string;
  /** Référence courte lisible (8 premiers caractères de l'id). */
  reference: string;
  /** Totaux par devise — les produits peuvent être en USD ET en CDF, jamais fusionnés. */
  totalUSD: number;
  totalCDF: number;
}

/** Réponse de GET /public/hotel — charte graphique publique d'un hôtel
 * (Phase 11), volontairement minimale (ni statutLicence, ni emailContact,
 * etc., qui n'ont rien à faire côté public). */
export interface InfoHotelPublique extends ContenuSiteHotel {
  /** false = la formule de l'hôtel n'inclut pas la réception : pas de réservation en ligne sur son site. Absent = ouverte. */
  reservationEnLigne?: boolean;
  nom: string;
  /** Réglage hôtel : l'onglet « Cuisine » (commande en ligne) est-il visible sur le site ? */
  commandeWebActivee: boolean;
  logoUrl: string | null;
  policeAffichage: string;
  policeCorps: string;
  policeMono: string;
  palette: unknown;
  adresse: string | null;
  telephoneContact: string | null;
  emailContact: string | null;
}

/** Icônes de service proposées au patron — synchronisé avec
 * `ICONES_SERVICE` de apps/api/src/hotel-site/dto/modifier-site.dto.ts. */
export const ICONES_SERVICE = [
  "restaurant",
  "piscine",
  "wifi",
  "parking",
  "navette",
  "climatisation",
  "salle-conference",
  "bar",
  "spa",
  "securite",
  "blanchisserie",
  "petit-dejeuner",
  "autre",
] as const;
export type IconeService = (typeof ICONES_SERVICE)[number];

export const LIBELLE_ICONE_SERVICE: Record<IconeService, string> = {
  restaurant: "Restaurant",
  piscine: "Piscine",
  wifi: "Wi-Fi",
  parking: "Parking",
  navette: "Navette",
  climatisation: "Climatisation",
  "salle-conference": "Salle de conférence",
  bar: "Bar",
  spa: "Spa",
  securite: "Sécurité 24 h/24",
  blanchisserie: "Blanchisserie",
  "petit-dejeuner": "Petit-déjeuner",
  autre: "Autre",
};

export interface ServiceHotel {
  icone: IconeService;
  titre: string;
  description?: string;
}

/** Réseaux sociaux connus (clés de `ContenuSiteHotel.reseaux`). */
export const RESEAUX_SOCIAUX = ["facebook", "instagram", "tiktok", "youtube", "x"] as const;
export type ReseauSocial = (typeof RESEAUX_SOCIAUX)[number];

/** Contenu éditorial du site public d'un hôtel (modèle HotelSite). */
export interface ContenuSiteHotel {
  slogan: string | null;
  presentation: string | null;
  couvertureUrl: string | null;
  galerie: string[];
  services: ServiceHotel[];
  whatsapp: string | null;
  horaireArrivee: string | null;
  horaireDepart: string | null;
  reception24h: boolean;
  lienCarte: string | null;
  reseaux: Partial<Record<ReseauSocial, string>>;
}

/** GET /hotel-site (PATRON) : coordonnées + contenu du site, à plat. */
export interface SiteHotelEditable extends ContenuSiteHotel {
  nom: string;
  /** Lecture seule (défini à l'inscription). */
  sousDomaine: string;
  adresse: string | null;
  telephoneContact: string | null;
  emailContact: string | null;
}

export type UsageImage = "chambre" | "couverture" | "galerie" | "produit";

/** Nombre maximal de photos par chambre (imposé aussi par l'API). */
export const MAX_PHOTOS_CHAMBRE = 2;
export const MAX_PHOTOS_GALERIE = 6;

/** GET /public/hotels-partenaires — hôtels ACTIF affichés sur la page d'accueil. */
export interface HotelPartenairePublic {
  nom: string;
  sousDomaine: string;
  logoUrl: string | null;
  adresse: string | null;
  couleur: string | null;
}

/** Doit rester synchronisé avec l'enum `MethodePaiementLicence` du schéma
 * Prisma (Phase 12, suivi manuel des paiements). */
export enum MethodePaiementLicence {
  VIREMENT = "VIREMENT",
  MOBILE_MONEY = "MOBILE_MONEY",
  ESPECES = "ESPECES",
  AUTRE = "AUTRE",
}

/** `HotelCree` + `valideJusquau` (Phase 12) — calculé côté serveur, jamais
 * stocké (voir apps/api/src/super-admin/calculer-validite.ts). Réponse de
 * GET /super-admin/hotels uniquement ; `HotelCree` seul reste la réponse des
 * endpoints d'onboarding/inscription, qui n'ont pas cette notion. */
export interface HotelAvecValidite extends HotelCree {
  valideJusquau: string;
  /** Formule payée en dernier (null = essai ou hôtel créé à la main). */
  formule?: string | null;
  /** Suspendu À LA MAIN par le support : ne peut pas se rouvrir en payant. */
  suspensionManuelle?: boolean;
  /** Nombre de chambres de l'hôtel (à comparer au plafond de sa formule). */
  nombreChambres?: number;
  /** Patron de l'hôtel et son numéro de connexion (null : compte antérieur au 15/10/2026). */
  patron: { nom: string; telephone: string | null } | null;
  /** Hôtel jamais payé : date de suppression automatique prévue (protection contre les essais abusifs). null sinon. */
  suppressionLe?: string | null;
}

// ---------------------------------------------------------------------------
// Notifications (push mobile + centre de notifications desktop/mobile)
// ---------------------------------------------------------------------------

export const TYPES_NOTIFICATION = [
  "DEMANDE_RESERVATION",
  "STOCK_BAS",
  "STOCK_EPUISE",
  "CHAMBRE_A_PREPARER",
  "RESERVATION_ANNULEE",
  "RECU_ANNULE",
  "ARRIVEES_DU_JOUR",
  "DEPART_DEPASSE",
  "RECAP_QUOTIDIEN",
  "LICENCE_BIENTOT_EXPIREE",
  "SUPPRESSION_ESSAI_PROCHE",
  "COMPTE_CAFETERIA_ANNULE",
  "LICENCE_SUSPENDUE",
  "RAPPORT_A_GENERER",
  "RAPPORT_DISPONIBLE",
  "COMMANDE_WEB",
  "PRE_ENREGISTREMENT",
  "ACOMPTE_MODIFIE",
  "ABONNEMENT_RENOUVELE",
  "ACOMPTE_PAYE_EN_LIGNE",
  "REMBOURSEMENT_A_FAIRE",
  "RESERVATION_HORS_LIGNE_REFUSEE",
] as const;
export type TypeNotification = (typeof TYPES_NOTIFICATION)[number];

/** Catégorie = canal Android (réglable une par une dans les réglages du téléphone). */
export type CategorieNotification = "reservations" | "stock" | "quotidien" | "securite";

export const CATEGORIE_PAR_TYPE: Record<TypeNotification, CategorieNotification> = {
  DEMANDE_RESERVATION: "reservations",
  RESERVATION_HORS_LIGNE_REFUSEE: "reservations",
  CHAMBRE_A_PREPARER: "reservations",
  DEPART_DEPASSE: "reservations",
  STOCK_BAS: "stock",
  STOCK_EPUISE: "stock",
  ARRIVEES_DU_JOUR: "quotidien",
  RECAP_QUOTIDIEN: "quotidien",
  RESERVATION_ANNULEE: "securite",
  RECU_ANNULE: "securite",
  ACOMPTE_MODIFIE: "securite",
  LICENCE_BIENTOT_EXPIREE: "securite",
  SUPPRESSION_ESSAI_PROCHE: "securite",
  COMPTE_CAFETERIA_ANNULE: "securite",
  LICENCE_SUSPENDUE: "securite",
  ABONNEMENT_RENOUVELE: "securite",
  ACOMPTE_PAYE_EN_LIGNE: "reservations",
  REMBOURSEMENT_A_FAIRE: "securite",
  RAPPORT_A_GENERER: "quotidien",
  RAPPORT_DISPONIBLE: "quotidien",
  COMMANDE_WEB: "reservations",
  PRE_ENREGISTREMENT: "reservations",
};

/** Écrans que le clic sur une notification peut ouvrir (mêmes ids que la navigation des apps). */
export type EcranNotification = "reservations" | "arrivees-departs" | "chambres" | "stock" | "facturation" | "tableau-de-bord" | "rapports" | "comptes-ouverts";

export interface LienNotification {
  ecran: EcranNotification;
  /** Identifiant à ouvrir directement (réservation, produit…). */
  id?: string;
}

/** GET /notifications — `lue` est propre à l'utilisateur connecté. */
export interface NotificationApp {
  id: string;
  type: TypeNotification;
  titre: string;
  corps: string;
  lien: LienNotification;
  createdAt: string;
  lue: boolean;
}

export interface ListeNotifications {
  notifications: NotificationApp[];
  /** Nombre total de notifications non lues de cet utilisateur (pas seulement dans la liste renvoyée). */
  nonLues: number;
}
/** GET /cafeteria/produits-populaires — quantités ajoutées aux comptes depuis le début de la journée. */
export interface ProduitPopulaire {
  produitId: string;
  quantite: number;
}

/** Une personne payée disparaît de l'écran du compte 1 minute après son règlement (affichage seulement). */
export const DELAI_MASQUAGE_PAYES_MS = 60_000;

/** Le lien « N personnes payées masquées · Afficher » disparaît à son tour 5 minutes après le règlement. */
export const DELAI_LIEN_PAYES_MS = 5 * 60_000;

/**
 * Personnes à afficher sur l'écran d'un compte cafétaria : celles qui n'ont pas encore payé restent
 * toujours visibles ; une personne payée s'efface après `DELAI_MASQUAGE_PAYES_MS` ou dès que
 * l'utilisateur l'écarte (`masquees`). Une personne masquée reste « revoyable » (lien « Afficher »)
 * jusqu'à `DELAI_LIEN_PAYES_MS` après son règlement, puis l'écran redevient totalement propre.
 * Purement visuel : rien n'est supprimé, les totaux et le journal des reçus restent exacts.
 */
export function sousComptesVisibles<T extends { id: string; payeLe?: string | null }>(
  sousComptes: T[],
  maintenant: number,
  masquees: ReadonlySet<string>
): { visibles: T[]; nbMasquees: number; revoyables: T[] } {
  const visibles: T[] = [];
  const revoyables: T[] = [];
  let nbMasquees = 0;
  for (const sc of sousComptes) {
    const payeDepuis = sc.payeLe ? maintenant - new Date(sc.payeLe).getTime() : null;
    const masquee = payeDepuis !== null && (masquees.has(sc.id) || payeDepuis >= DELAI_MASQUAGE_PAYES_MS);
    if (!masquee) {
      visibles.push(sc);
      continue;
    }
    nbMasquees++;
    if (payeDepuis !== null && payeDepuis < DELAI_LIEN_PAYES_MS) revoyables.push(sc);
  }
  return { visibles, nbMasquees, revoyables };
}

// ---------------------------------------------------------------------------
// Rapports mensuels PDF par département (cafétaria, réception) — remis au patron.
// ---------------------------------------------------------------------------

export type DepartementRapport = "CAFETERIA" | "RECEPTION";

/** Guide d'utilisation PDF (20/10/2026). Doit rester synchronisé avec l'enum `TypeGuide` du schéma Prisma. */
export type TypeGuide = "COMPLET" | "PATRON" | "RECEPTION" | "CAFETERIA";

/** Guides que chaque rôle peut ouvrir : le patron tous, le personnel celui de son poste. */
export const GUIDES_PAR_ROLE: Record<Role, TypeGuide[]> = {
  [Role.PATRON]: ["COMPLET", "PATRON", "RECEPTION", "CAFETERIA"],
  [Role.RECEPTIONNISTE]: ["RECEPTION"],
  [Role.CAFETARIA]: ["CAFETERIA"],
};

export const LIBELLE_GUIDE: Record<TypeGuide, string> = {
  COMPLET: "Guide complet",
  PATRON: "Guide du patron",
  RECEPTION: "Guide du réceptionniste",
  CAFETERIA: "Guide de la cafétaria",
};

/** GET /guides — dernière version publiée de chaque guide permis au compte. */
export interface GuideDisponible {
  guide: TypeGuide;
  libelle: string;
  version: number;
  edition: string | null;
  /** Taille du PDF en octets. */
  taille: number;
  publieLe: string;
}
export type StatutRapport = "ACTIF" | "REMPLACE";

/** Une ligne de GET /rapports — le PDF lui-même vit dans le stockage privé,
 * ouvert via `urlRapport` (URL signée de 5 min). */
export interface RapportMensuel {
  id: string;
  departement: DepartementRapport;
  /** « 2026-09 » — fuseau Africa/Lubumbashi. */
  periode: string;
  version: number;
  numero: string; // RAP-CAF-202609-001
  provisoire: boolean; // mois pas encore terminé
  statut: StatutRapport;
  genereParNom: string;
  genereLe: string;
  concordant: boolean;
  empreinte: string;
}

/** GET /dashboard/recette-du-mois — même fonction d'agrégation que le rapport
 * PDF : la « concordance » affichée dans le document est une vraie comparaison. */
export interface RecetteDuMois {
  periode: string;
  enCours: boolean;
  chambres?: MontantsParDevise & { nombreFactures: number; nuitees: number; tauxOccupationPourcent: number };
  cafeteria?: MontantsParDevise & { nombreVentes: number; panierMoyenUSD: number; panierMoyenCDF: number };
  total: MontantsParDevise;
}

// ---------------------------------------------------------------------------
// Dépenses par département (réception, cafétaria) — saisies par le personnel,
// consultées par le patron (demande du 07/10/2026).
// ---------------------------------------------------------------------------

/** Une ligne de GET /depenses. `montant` est un Decimal Prisma sérialisé en
 * chaîne ; `date` = « AAAA-MM-JJ » (jour de la dépense, sans heure). */
export interface Depense {
  id: string;
  departement: DepartementRapport;
  date: string;
  motif: string;
  montant: string;
  devise: Devise;
  creeParId: string;
  creeParNom: string;
  annulee: boolean;
  annuleeLe: string | null;
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}

export interface CreerDepense {
  /** « AAAA-MM-JJ ». */
  date: string;
  motif: string;
  montant: number;
  devise: Devise;
}

export interface ModifierDepense extends Partial<CreerDepense> {
  /** true = annuler la dépense (irréversible, jamais de suppression). */
  annulee?: boolean;
}

export interface FiltresDepenses {
  /** « AAAA-MM-JJ » inclus. */
  du: string;
  /** « AAAA-MM-JJ » inclus. */
  au: string;
  /** PATRON seulement — le personnel ne voit que son département. */
  departement?: DepartementRapport;
}

// ---------------------------------------------------------------------------
// Suivi de réservation par le client (site de l'hôtel) + pré-enregistrement
// en ligne (07/10/2026).
// ---------------------------------------------------------------------------

/** Code lisible montré au client : « RES-1A2B3C4D ». */
export function codeSuivi(jetonSuivi: string): string {
  return `RES-${jetonSuivi.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/** Lien « Ma réservation » à partir de l'adresse du site de l'hôtel
 * (`ProfilConnecte.hotelUrlSite`) — construit sans réseau, depuis le miroir
 * local. Garde la requête `?hotel=` quand le site n'a pas de domaine propre. */
export function lienSuivi(hotelUrlSite: string, jetonSuivi: string): string {
  const [base, requete] = hotelUrlSite.split("?");
  return `${base.replace(/\/+$/, "")}/ma-reservation/${encodeURIComponent(jetonSuivi)}${requete ? `?${requete}` : ""}`;
}

export type StatutSuiviPublic = "EN_ATTENTE" | "CONFIRMEE" | "EN_COURS" | "TERMINEE" | "ANNULEE" | "NON_RETENUE";

/** Réponse de GET /public/suivi/:jeton — uniquement ce que le client doit
 * voir : jamais le numéro de pièce ni le motif interne d'une annulation. */
export interface SuiviReservationPublic {
  code: string;
  statut: StatutSuiviPublic;
  hotel: { nom: string; whatsapp: string | null; telephone: string | null };
  client: { nom: string };
  chambre: { numero: string; type: string };
  dateArrivee: string;
  dateDepart: string;
  nuits: number;
  totalEstime: string;
  acompte: string;
  devise: Devise;
  preEnregistrement: {
    fait: boolean;
    le: string | null;
    heureArriveePrevue: string | null;
    demandeClient: string | null;
    pieceRenseignee: boolean;
  };
  /** Message laissé par la réception — la voix de l'hôtel dans le suivi. */
  reponseReception: string | null;
  peutAnnuler: boolean;
  peutPreEnregistrer: boolean;
  /** Paiement de l'acompte en ligne ; null = non proposé par cet hôtel. */
  acompteEnLigne: AcompteEnLigne | null;
}

export type TypePiece = "CNI" | "PASSEPORT" | "PERMIS" | "AUTRE";

/** Corps de POST /public/suivi/:jeton/pre-enregistrement. */
export interface PreEnregistrementPayload {
  typePiece: TypePiece;
  numeroPiece: string;
  /** « HH:MM ». */
  heureArriveePrevue: string;
  demandeClient?: string;
  email?: string;
  telephone?: string;
}


// ---------------------------------------------------------------------------------------------------------------------------------
// Abonnement (voir packages/regles/src/abonnement.ts pour les règles, apps/api/src/abonnement pour le serveur)

export type StatutAbonnement = "ESSAI" | "ACTIF" | "EN_GRACE" | "EXPIRE" | "SUSPENDU" | "RESILIE";

/** Ce que voient les applications (réponse de /auth/me et de /abonnement). */
export interface EtatAbonnement {
  statut: StatutAbonnement;
  /** Fin de la période payée (ou de l'essai), ISO. */
  valideJusquau: string;
  /** Jours restants avant l'échéance, arrondis au-dessus ; 0 ou négatif une fois dépassée. */
  joursRestants: number;
  /** Fin du délai de grâce, ISO. */
  graceJusquau: string;
  /** Accès à l'application coupé : seul le renouvellement reste possible (ou rien du tout si suspendu à la main / résilié). */
  bloque: boolean;
  /** Le patron peut renouveler en ligne. Faux si l'hôtel est suspendu à la main ou résilié : il doit contacter le support. */
  renouvelable: boolean;
  /** Message d'alerte à afficher à tous (null = rien à signaler). */
  alerte: "BIENTOT" | "GRACE" | "EXPIRE" | "SUSPENDU" | "RESILIE" | null;
  /** Hôtel qui n'a jamais payé : date (ISO) à laquelle ses données seront supprimées s'il ne paie pas (18/10/2026). null sinon. */
  suppressionLe?: string | null;
  /** Plafonds de l'essai gratuit (hôtel qui n'a jamais payé) ; null une fois une formule payée. Appliqués aussi hors ligne. */
  plafondsEssai?: PlafondsEssai | null;
}

export interface PlafondsEssai {
  chambres: number;
  produits: number;
  photosGalerie: number;
}

export type OperateurMobileMoney = "VODACOM" | "ORANGE" | "AIRTEL" | "AFRICELL";
export type StatutPaiementAbonnement = "EN_ATTENTE" | "REUSSI" | "ECHEC" | "EXPIRE";

/** Une durée d'achat avec son prix dans chaque devise (calculé par le serveur — la seule référence). */
export interface PrixDuree {
  mois: number;
  /** Mois offerts compris dans cette durée (ex. 2 pour 12 mois). */
  moisOfferts: number;
  prixUsd: number;
  prixCdf: number;
}

export interface FormuleProposee {
  /** Identifiant libre défini par le super-admin (ESSENTIEL, PRO, PREMIUM au départ). */
  code: string;
  nom: string;
  description: string;
  recommandee: boolean;
  maxChambres: number | null;
  /** Lignes prêtes à afficher : plafond de chambres, fonctions ouvertes, avantages libres. */
  inclus: string[];
  /** Fonctions ouvertes (RECEPTION, CAFETERIA, SITE_PUBLIC, DOMAINE_PERSONNALISE, ACOMPTE_EN_LIGNE). */
  fonctions: string[];
  prixMensuelUsd: number;
  durees: PrixDuree[];
}

/** Un paiement d'abonnement vu par l'application : en cours, réussi ou échoué. */
export interface PaiementAbonnementVue {
  id: string;
  formule: string;
  mois: number;
  montant: number;
  devise: "USD" | "CDF";
  /** EN_LIGNE = payé dans l'application ; SUPPORT = enregistré à la main par l'équipe HotelSaver (virement, espèces…). */
  source: "EN_LIGNE" | "SUPPORT";
  operateur: OperateurMobileMoney | null;
  telephoneMasque: string | null;
  statut: StatutPaiementAbonnement;
  messageErreur: string | null;
  /** Commission ScanLinkPay et total débité, dans la devise du paiement (null si ScanLinkPay ne les a pas donnés ou paiement saisi à la main). */
  commission?: number | null;
  total?: number | null;
  /** Nouvelle échéance, quand le paiement a réussi. */
  periodeCouverteJusquau: string | null;
  createdAt: string;
  confirmeLe: string | null;
}

/** Réponse de GET /abonnement. */
export interface VueAbonnement {
  etat: EtatAbonnement;
  /** Formule payée en dernier ; null pendant l'essai. */
  formuleActuelle: string | null;
  nombreChambres: number;
  /** false = le serveur n'est pas relié à ScanLinkPay : on ne peut pas payer en ligne (contacter le support). */
  paiementEnLigne: boolean;
  /** Fonctions ouvertes à cet hôtel en ce moment (formule payée, ou essai). */
  fonctions: string[];
  /** Contact du support HotelSaver (téléphone et WhatsApp). */
  contactSupport: { telephone: string; whatsapp: string };
  /** Page du site où le patron paie son abonnement depuis n'importe quel navigateur (https). Absente sur un serveur plus ancien. */
  urlPaiementSite?: string;
  formules: FormuleProposee[];
  /** Paiement en cours (Mobile Money envoyé, en attente de confirmation sur le téléphone), s'il y en a un. */
  paiementEnCours: PaiementAbonnementVue | null;
  /** Les derniers paiements, du plus récent au plus ancien (réservé au patron ; vide pour les autres rôles). */
  historique: PaiementAbonnementVue[];
}

/** Ce que coûterait un paiement, AVANT de le lancer : le prix, la commission ScanLinkPay (règles du super admin ScanLinkPay, par devise) et le total débité. */
export interface ApercuPaiement {
  devise: "USD" | "CDF";
  /** Le prix (ou l'acompte) : ce que le bénéficiaire doit recevoir. */
  montant: number;
  /** Commission ScanLinkPay. */
  commission: number;
  /** Ce que le payeur débourse : `montant` + sa part de commission. */
  total: number;
  /** Qui porte la commission : le payeur (en plus), le bénéficiaire (retenue), ou moitié-moitié. */
  commissionPayeePar: "PAYEUR" | "BENEFICIAIRE" | "PARTAGE";
  /** null si ScanLinkPay n'a pas pu répondre : on affiche alors le montant seul. */
  disponible: boolean;
}

/** Corps de POST /abonnement/paiements. */
export interface DemandePaiementAbonnement {
  formule: string;
  mois: number;
  devise: "USD" | "CDF";
  operateur: OperateurMobileMoney;
  telephone: string;
  /** UUID généré par l'application pour CETTE tentative : la renvoyer après une coupure réseau ne débite pas deux fois. */
  cleIdempotence: string;
}


// ---------------------------------------------------------------------------------------------------------------------------------
// Acompte de réservation payé en ligne (site public → compte ScanLinkPay de l'hôtel) et remboursements

export type MoyenPaiementEnLigne = "MOBILE_MONEY" | "CARTE";
export type ModeRemboursement = "SCANLINKPAY" | "MOBILE_MONEY" | "ESPECES" | "AUTRE";
export type MotifRemboursement = "ANNULATION_CLIENT" | "ANNULATION_HOTEL" | "NON_PRESENTATION" | "CHAMBRE_INDISPONIBLE" | "AUTRE";
export type StatutRemboursement = "A_FAIRE" | "EFFECTUE" | "CONSERVE";

/** Un paiement d'acompte vu du client ou du personnel. Les montants sont dans la devise de la chambre. */
export interface PaiementReservationVue {
  id: string;
  /** L'acompte lui-même (ce que l'hôtel reçoit). */
  montant: number;
  devise: "USD" | "CDF";
  moyen: MoyenPaiementEnLigne;
  operateur: OperateurMobileMoney | null;
  telephoneMasque: string | null;
  statut: StatutPaiementAbonnement;
  messageErreur: string | null;
  /** Commission ScanLinkPay et total débité au client (null si inconnus). */
  commission: number | null;
  total: number | null;
  /** Carte : la page de paiement sécurisée où envoyer le client (https), tant que le paiement est en attente. */
  urlPaiement: string | null;
  createdAt: string;
  confirmeLe: string | null;
}

export interface RemboursementClientVue {
  statut: "EN_COURS" | "EFFECTUE" | "CONSERVE";
  montant: number;
  devise: "USD" | "CDF";
  mode: ModeRemboursement | null;
  le: string | null;
}

/** L'acompte en ligne tel que la page « Ma réservation » le présente au client. `null` dans le suivi = ce service n'existe pas sur ce site. */
export interface AcompteEnLigne {
  disponible: boolean;
  /** Pourquoi on ne peut pas payer maintenant (réservation annulée, chambre prise, déjà soldé…) ; null si disponible. */
  indisponibleRaison: string | null;
  pourcentage: number;
  devise: "USD" | "CDF";
  /** L'acompte demandé au total (pourcentage × séjour). */
  objectif: number;
  dejaPaye: number;
  reste: number;
  moyens: { mobileMoney: boolean; carte: boolean };
  /** true = le client paie la commission ScanLinkPay en plus de l'acompte. */
  fraisPayesParClient: boolean;
  /** Nom de l'entreprise chez ScanLinkPay (« vous payez à : … »). */
  nomMarchand: string | null;
  conditionsAnnulation: string | null;
  paiementEnCours: PaiementReservationVue | null;
  paiements: PaiementReservationVue[];
  remboursement: RemboursementClientVue | null;
  /** Adresse pour créer un compte ScanLinkPay (remboursement rapide, paiements partout) ; null si inconnue. */
  urlScanLinkPay: string | null;
}

/** Corps de POST /public/suivi/:jeton/paiement. */
export interface DemandePaiementReservation {
  sousDomaine: string;
  moyen: MoyenPaiementEnLigne;
  operateur?: OperateurMobileMoney;
  telephone?: string;
  /** Le numéro ScanLinkPay du client, s'il en a un : l'acompte y sera remboursé en cas d'annulation. */
  numeroScanLinkPay?: string;
  email?: string;
  /** UUID propre à cette tentative : la renvoyer après une coupure ne débite pas deux fois. */
  cleIdempotence: string;
  captchaToken?: string;
}

/** GET/PATCH /hotel/paiement-en-ligne : le compte ScanLinkPay de l'hôtel et la règle d'acompte, réservés au PATRON. */
export interface ReglagesPaiementEnLigne {
  /** La formule de l'hôtel ouvre-t-elle le paiement en ligne ? */
  fonctionIncluse: boolean;
  /** Le serveur HotelSaver est-il relié à ScanLinkPay ? */
  serveurRelie: boolean;
  numeroScanLinkPay: string | null;
  boutiqueScanLinkPayId: string | null;
  /** Nom de l'entreprise connu de ScanLinkPay pour ce numéro : le patron vérifie que c'est bien la sienne. */
  nomScanLinkPay: string | null;
  /** 0 = pas de paiement en ligne. */
  pourcentageAcompte: number;
  fraisPayesParClient: boolean;
  conditionsAnnulation: string | null;
  urlScanLinkPay: string | null;
}

export interface ModifierReglagesPaiementEnLigne {
  /** null = retirer le compte (le paiement en ligne s'arrête). */
  numeroScanLinkPay?: string | null;
  boutiqueScanLinkPayId?: string | null;
  pourcentageAcompte?: number;
  fraisPayesParClient?: boolean;
  conditionsAnnulation?: string | null;
}

/** Un acompte PAYÉ EN LIGNE vu du personnel (réception, patron) : repère « Payé en ligne » dans les listes et détail du paiement. */
export interface AcompteEnLignePersonnel {
  paiementId: string;
  reservationId: string;
  /** L'acompte reçu par l'hôtel, dans la devise de la chambre. */
  montant: number;
  devise: "USD" | "CDF";
  moyen: MoyenPaiementEnLigne;
  operateur: OperateurMobileMoney | null;
  telephoneMasque: string | null;
  /** Référence à donner au support ScanLinkPay en cas de question. */
  reference: string | null;
  confirmeLe: string | null;
  /** Si la réservation a été annulée : où en est le remboursement (A_FAIRE, EFFECTUE, CONSERVE). */
  remboursement: StatutRemboursement | null;
}

/** Un remboursement d'acompte à faire (ou fait) — écran « Remboursements » du patron. */
export interface RemboursementVue {
  id: string;
  reservationId: string;
  clientNom: string;
  chambreNumero: string | null;
  dateArrivee: string | null;
  devise: "USD" | "CDF";
  montantPaye: number;
  montantARembourser: number;
  motif: MotifRemboursement;
  statut: StatutRemboursement;
  mode: ModeRemboursement | null;
  /** Où envoyer l'argent : le numéro ScanLinkPay du client s'il l'a donné, sinon son téléphone. */
  destinataireScanLinkPay: string | null;
  destinataireTelephone: string | null;
  reference: string | null;
  note: string | null;
  traiteLe: string | null;
  createdAt: string;
}

/** Corps de PATCH /remboursements/:id. */
export interface TraiterRemboursement {
  action: "EFFECTUE" | "CONSERVE";
  /** Montant réellement rendu (par défaut le montant proposé ; jamais plus que ce qui a été payé). */
  montant?: number;
  mode?: ModeRemboursement;
  reference?: string;
  note?: string;
}


// ---------------------------------------------------------------------------------------------------------------------------------
// Administration des formules par le super-admin

export type CodeFonction = "RECEPTION" | "CAFETERIA" | "SITE_PUBLIC" | "DOMAINE_PERSONNALISE" | "ACOMPTE_EN_LIGNE";

/** Une formule telle que le super-admin la gère. */
export interface FormuleAdminVue {
  id: string;
  code: string;
  nom: string;
  description: string;
  prixMensuelUsd: number;
  maxChambres: number | null;
  fonctions: CodeFonction[];
  avantages: string[];
  recommandee: boolean;
  /** false = n'est plus proposée à l'achat (ceux qui l'ont déjà la gardent). */
  actif: boolean;
  ordre: number;
  hotelsAbonnes: number;
}

export interface DonneesFormule {
  code?: string;
  nom: string;
  description?: string;
  prixMensuelUsd: number;
  maxChambres?: number | null;
  fonctions: CodeFonction[];
  avantages?: string[];
  recommandee?: boolean;
  actif?: boolean;
  ordre?: number;
}

/** Réglages de la plateforme modifiables par le super-admin. */
export interface ParametresPlateformeVue {
  tauxCdf: number;
  moisOffertsAnnuel: number;
  joursEssai: number;
  joursGrace: number;
  fonctionsEssai: CodeFonction[];
  fraisAbonnementPayesParClient: boolean;
  contactTelephone: string;
  contactWhatsapp: string;
  /** Protection contre les essais abusifs (18/10/2026). */
  joursAvantSuppression: number;
  maxChambresEssai: number;
  maxProduitsEssai: number;
  maxPhotosGalerieEssai: number;
  maxInscriptionsParJour: number;
}

/** Hôtel supprimé automatiquement (essai abandonné), vu par le super-admin. */
export interface HotelSupprimeVue {
  id: string;
  nom: string;
  sousDomaine: string;
  creeLe: string;
  supprimeLe: string;
  motif: string;
}

/** GET /public/formules : la page des tarifs du site vitrine. */
export interface FormulesPubliques {
  formules: FormuleProposee[];
  parametres: { tauxCdf: number; moisOffertsAnnuel: number; joursEssai: number; joursGrace: number };
  contact: { telephone: string; whatsapp: string };
}

// ---------------------------------------------------------------------------
// Numéros de téléphone (connexion par numéro, 15/10/2026)
// ---------------------------------------------------------------------------

/** Indicatif de la RDC, seul pays proposé pour l'instant. */
export const INDICATIF_RDC = "+243";

/**
 * Normalise une saisie de numéro congolais vers « +243XXXXXXXXX ».
 * Accepte « 0970000000 », « 970 000 000 », « +243 970 000 000 », « 243-970… ».
 * Un numéro RDC compte 9 chiffres après l'indicatif et commence par 8 ou 9
 * (Vodacom 81-83, Orange 84/85/89, Africell 90/91, Airtel 97-99…).
 * Renvoie `null` si la saisie n'est pas un numéro RDC valide.
 */
export function normaliserTelephoneRdc(saisie: string | null | undefined): string | null {
  if (!saisie) return null;
  let chiffres = saisie.replace(/\D/g, "");
  if (chiffres.startsWith("00243")) chiffres = chiffres.slice(5);
  else if (chiffres.startsWith("243") && chiffres.length === 12) chiffres = chiffres.slice(3);
  else if (chiffres.startsWith("0") && chiffres.length === 10) chiffres = chiffres.slice(1);
  return /^[89]\d{8}$/.test(chiffres) ? `${INDICATIF_RDC}${chiffres}` : null;
}

/** « 970 000 000 » à partir de chiffres partiels (formatage pendant la saisie, 9 chiffres max). */
export function formaterSaisieRdc(saisie: string): string {
  const chiffres = saisie.replace(/\D/g, "").replace(/^0/, "").slice(0, 9);
  return [chiffres.slice(0, 3), chiffres.slice(3, 6), chiffres.slice(6, 9)].filter(Boolean).join(" ");
}

/** « +243 970 000 000 » pour l'affichage d'un numéro normalisé (ou la saisie brute si invalide). */
export function formaterTelephoneRdc(telephone: string | null | undefined): string {
  const normalise = normaliserTelephoneRdc(telephone);
  if (!normalise) return telephone ?? "";
  return `${INDICATIF_RDC} ${formaterSaisieRdc(normalise.slice(INDICATIF_RDC.length))}`;
}
