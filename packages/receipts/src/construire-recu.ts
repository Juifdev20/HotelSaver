import { CompteCafeteria, Devise, Facture, ModePaiement, ProfilConnecte, Reservation, VenteCafeteria } from "@hotel-chicago/types";
import { formatMontant } from "./format-montant";
import { LigneRecu } from "./types";

const LIBELLE_MODE_PAIEMENT: Record<ModePaiement, string> = {
  [ModePaiement.CASH]: "Espèces",
  [ModePaiement.MOBILE_MONEY]: "Mobile Money",
  [ModePaiement.FACTURE_CHAMBRE]: "Facturé sur la chambre",
};

function formaterDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

function formaterHeure(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function nombreDeNuits(dateArrivee: string, dateDepart: string): number {
  const millisecondesParJour = 1000 * 60 * 60 * 24;
  return Math.max(1, Math.round((new Date(dateDepart).getTime() - new Date(dateArrivee).getTime()) / millisecondesParJour));
}

/** Identité de l'hôtel imprimée en tête de chaque reçu (section 11.2/11.3). */
export interface EnteteHotel {
  nom: string;
  adresse?: string | null;
  telephone?: string | null;
}

/** L'en-tête du reçu d'après le profil connecté (`GET /auth/me`) : toujours l'hôtel de
 * l'utilisateur, jamais un nom codé en dur. */
export function enteteHotel(profil: Pick<ProfilConnecte, "hotelNom" | "hotelAdresse" | "hotelTelephone">): EnteteHotel {
  return { nom: profil.hotelNom, adresse: profil.hotelAdresse, telephone: profil.hotelTelephone };
}

/** En-tête commun aux deux types de reçu (section 11.2/11.3). Le tiret est un « - » ASCII :
 * le « — » n'existe pas dans la table CP850 de l'imprimante et s'imprimait « ? ». */
function enTete(hotel: EnteteHotel, sousTitre?: string): LigneRecu[] {
  const nom = hotel.nom.trim() || "HOTEL";
  const lignes: LigneRecu[] = [{ type: "titre", texte: sousTitre ? `${nom} - ${sousTitre}` : nom }];
  if (hotel.adresse?.trim()) lignes.push({ type: "soustitre", texte: hotel.adresse.trim() });
  if (hotel.telephone?.trim()) lignes.push({ type: "soustitre", texte: `Tél. ${hotel.telephone.trim()}` });
  lignes.push({ type: "separateur" });
  return lignes;
}

function piedDePage(): LigneRecu[] {
  return [{ type: "soustitre", texte: "Merci de votre visite !" }];
}

/** Lignes de règlement/monnaie communes aux deux reçus (section 11.2/11.3). */
function lignesReglement(donnees: {
  modePaiement: ModePaiement;
  deviseRegleeParClient: Devise | null;
  montantRegleParClient: string | null;
  deviseMonnaieRendue: Devise | null;
  montantMonnaieRendue: string | null;
}): LigneRecu[] {
  const lignes: LigneRecu[] = [
    { type: "separateur" },
    { type: "champ", label: "Mode de paiement", valeur: LIBELLE_MODE_PAIEMENT[donnees.modePaiement] },
  ];
  if (donnees.deviseRegleeParClient && donnees.montantRegleParClient) {
    lignes.push({
      type: "montant",
      libelle: `Réglé en ${donnees.deviseRegleeParClient}`,
      valeur: formatMontant(donnees.montantRegleParClient, donnees.deviseRegleeParClient),
    });
  }
  if (donnees.deviseMonnaieRendue && donnees.montantMonnaieRendue) {
    lignes.push({
      type: "montant",
      libelle: "Monnaie rendue",
      valeur: formatMontant(donnees.montantMonnaieRendue, donnees.deviseMonnaieRendue),
    });
  }
  return lignes;
}

/** Ne jamais imprimer un total nul (section 11) — un ticket dans une seule
 * devise n'affiche qu'une ligne de total. */
function lignesTotaux(montantTotalUSD: string, montantTotalCDF: string, prefixe: string): LigneRecu[] {
  const lignes: LigneRecu[] = [{ type: "separateur" }];
  if (Number(montantTotalUSD) > 0) {
    lignes.push({ type: "montant", libelle: `${prefixe} EN USD`, valeur: formatMontant(montantTotalUSD, Devise.USD) });
  }
  if (Number(montantTotalCDF) > 0) {
    lignes.push({ type: "montant", libelle: `${prefixe} EN CDF`, valeur: formatMontant(montantTotalCDF, Devise.CDF) });
  }
  return lignes;
}

/** Reçu fait hors ligne : son numéro (TEMP-…) est provisoire, le vrai est attribué à l'enregistrement par le serveur. */
function estProvisoire(numeroRecu: string): boolean {
  return numeroRecu.startsWith("TEMP-");
}

/** Mention imprimée tout en haut ET en bas d'un reçu provisoire : le client doit comprendre que ce n'est pas le reçu définitif. */
function bandeauProvisoire(numeroRecu: string): LigneRecu[] {
  return estProvisoire(numeroRecu) ? [{ type: "soustitre", texte: "*** REÇU PROVISOIRE ***" }] : [];
}

/** Réimpression d'un reçu déjà remis : jamais présentable comme un original. */
function bandeauDuplicata(options: OptionsRecu): LigneRecu[] {
  if (!options.duplicata) return [];
  const maintenant = new Date().toISOString();
  return [
    { type: "soustitre", texte: "*** DUPLICATA ***" },
    { type: "champ", label: "Réimprimé le", valeur: `${formaterDate(maintenant)} ${formaterHeure(maintenant)}` },
  ];
}

export interface OptionsRecu {
  /** Vrai pour une réimpression : ajoute « DUPLICATA » et la date de réimpression (la date du reçu reste celle de l'original). */
  duplicata?: boolean;
}

function noteProvisoire(numeroRecu: string): LigneRecu[] {
  return estProvisoire(numeroRecu)
    ? [{ type: "separateur" }, { type: "soustitre", texte: "Reçu établi hors connexion." }, { type: "soustitre", texte: "Conservez-le : le reçu définitif" }, { type: "soustitre", texte: `se retrouve avec le n° ${numeroRecu}.` }]
    : [];
}

/**
 * Reçu de facturation d'un séjour (section 11.2). `nomReceptionniste` vient
 * de l'utilisateur authentifié au moment de l'impression — `Facture` n'a
 * aucun champ d'identité du personnel (voir DECISIONS.md). `ventesCafeteriaLiees`
 * : consommations réglées sur la chambre (`VenteCafeteria.reservationLieeId`),
 * à récupérer séparément via `ClientApi.listerVentesCafeteria(reservationId)`.
 */
export function construireRecuFacture(
  facture: Facture,
  reservation: Reservation,
  nomReceptionniste: string,
  ventesCafeteriaLiees: VenteCafeteria[],
  hotel: EnteteHotel,
  options: OptionsRecu = {}
): LigneRecu[] {
  // Date du reçu = celle de la facture (un reçu réimprimé garde sa date d'origine), jamais l'instant de l'impression.
  const dateFacture = Number.isNaN(new Date(facture.createdAt).getTime()) ? new Date().toISOString() : new Date(facture.createdAt).toISOString();
  const maintenant = dateFacture;
  const lignes: LigneRecu[] = [
    ...enTete(hotel),
    ...bandeauDuplicata(options),
    ...bandeauProvisoire(facture.numeroRecu),
    { type: "champ", label: "Reçu n°", valeur: facture.numeroRecu },
    { type: "champ", label: "Date", valeur: `${formaterDate(maintenant)} ${formaterHeure(maintenant)}` },
    { type: "champ", label: "Reçu par", valeur: nomReceptionniste },
    { type: "separateur" },
    { type: "champ", label: "Client", valeur: reservation.client.nom },
    { type: "champ", label: "Chambre", valeur: `${reservation.chambre.numero} (${reservation.chambre.type})` },
    { type: "champ", label: "Arrivée", valeur: formaterDate(reservation.dateArrivee) },
    { type: "champ", label: "Départ", valeur: formaterDate(reservation.dateDepart) },
    { type: "champ", label: "Nombre de nuits", valeur: String(nombreDeNuits(reservation.dateArrivee, reservation.dateDepart)) },
    { type: "separateur" },
    {
      type: "montant",
      libelle: "Prix/nuit",
      valeur: formatMontant(reservation.chambre.prixParNuit, reservation.chambre.devise),
    },
  ];

  if (Number(reservation.acompte) > 0) {
    lignes.push({ type: "montant", libelle: "Acompte versé", valeur: formatMontant(reservation.acompte, reservation.chambre.devise) });
  }

  if (ventesCafeteriaLiees.length > 0) {
    lignes.push({ type: "separateur" }, { type: "soustitre", texte: "Consommations cafétaria liées" });
    for (const vente of ventesCafeteriaLiees) {
      if (Number(vente.montantTotalUSD) > 0) {
        lignes.push({ type: "montant", libelle: `Reçu ${vente.numeroRecu}`, valeur: formatMontant(vente.montantTotalUSD, Devise.USD) });
      }
      if (Number(vente.montantTotalCDF) > 0) {
        lignes.push({ type: "montant", libelle: `Reçu ${vente.numeroRecu}`, valeur: formatMontant(vente.montantTotalCDF, Devise.CDF) });
      }
    }
  }

  lignes.push(...lignesTotaux(facture.montantTotalUSD, facture.montantTotalCDF, "TOTAL À PAYER"));
  lignes.push(...lignesReglement(facture));
  lignes.push(...noteProvisoire(facture.numeroRecu));
  lignes.push(...piedDePage());
  return lignes;
}

/**
 * Reçu de vente cafétaria (section 11.3). `compte` doit être le
 * CompteCafeteria complet (sous-comptes + lignes + produit inclus, voir
 * `ClientApi.obtenirCompteCafeteria`) — les lignes imprimées sont TOUTES
 * celles du compte, correct uniquement pour un encaissement en mode
 * GROUPE (seul mode construit côté Caisse mobile à ce jour ; voir le plan).
 */
export function construireRecuVente(
  vente: VenteCafeteria,
  compte: CompteCafeteria,
  nomServeur: string,
  hotel: EnteteHotel,
  options: OptionsRecu = {}
): LigneRecu[] {
  const lignes: LigneRecu[] = [
    ...enTete(hotel, "Cafétaria"),
    ...bandeauDuplicata(options),
    ...bandeauProvisoire(vente.numeroRecu),
    { type: "champ", label: "Reçu n°", valeur: vente.numeroRecu },
    { type: "champ", label: "Date", valeur: `${formaterDate(vente.createdAt)} ${formaterHeure(vente.createdAt)}` },
    { type: "champ", label: "Servi par", valeur: nomServeur },
    { type: "champ", label: "Table/Compte", valeur: compte.tableOuNom },
    { type: "separateur" },
  ];

  for (const sousCompte of compte.sousComptes) {
    for (const ligne of sousCompte.lignes) {
      const montantLigne = Number(ligne.prixUnitaire) * Number(ligne.quantite);
      lignes.push({
        type: "montant",
        libelle: `${ligne.quantite}x ${ligne.produit.nom}`,
        valeur: formatMontant(montantLigne, ligne.devise),
      });
    }
  }

  lignes.push(...lignesTotaux(vente.montantTotalUSD, vente.montantTotalCDF, "TOTAL"));
  lignes.push(...lignesReglement(vente));
  lignes.push(...noteProvisoire(vente.numeroRecu));
  lignes.push(...piedDePage());
  return lignes;
}
