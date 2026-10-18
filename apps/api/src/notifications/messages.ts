import type { LienNotification, TypeNotification } from "@hotel-chicago/types";

/** Contenu d'une notification, prêt à être émis (voir NotificationsService.emettre). */
export interface MessageNotification {
  type: TypeNotification;
  titre: string;
  corps: string;
  lien: LienNotification;
}

const FUSEAU = "Africa/Lubumbashi";

function dateCourte(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: FUSEAU }).format(date);
}

function heureCourte(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: FUSEAU }).format(date);
}

/** « 3 » → « 3 », « 2.50 » → « 2,5 » : pas de décimales inutiles dans un message. */
function nombre(valeur: number | string): string {
  return String(Math.round(Number(valeur) * 100) / 100).replace(".", ",");
}

function pluriel(n: number, singulier: string, plurielForme: string): string {
  return `${n} ${n > 1 ? plurielForme : singulier}`;
}

function montant(valeur: number, devise: "USD" | "CDF"): string {
  if (devise === "CDF") return `${Math.round(valeur).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FC`;
  return `${valeur.toFixed(2)} $`;
}

/** Tous les textes des notifications au même endroit : relire/ajuster un message ne
 * demande de toucher à aucun service métier. */
export const messages = {
  demandeReservation(p: { client: string; chambre: string; arrivee: Date; depart: Date; reservationId: string }): MessageNotification {
    return {
      type: "DEMANDE_RESERVATION",
      titre: "Nouvelle demande de réservation",
      corps: `${p.client} · Ch. ${p.chambre} · ${dateCourte(p.arrivee)} → ${dateCourte(p.depart)}`,
      lien: { ecran: "reservations", id: p.reservationId },
    };
  },

  stockBas(p: { produit: string; stock: number | string; produitId: string }): MessageNotification {
    return {
      type: "STOCK_BAS",
      titre: "Stock bas",
      corps: `${p.produit} : plus que ${nombre(p.stock)} en stock`,
      lien: { ecran: "stock", id: p.produitId },
    };
  },

  stockEpuise(p: { produit: string; produitId: string }): MessageNotification {
    return {
      type: "STOCK_EPUISE",
      titre: "Rupture de stock",
      corps: `${p.produit} est épuisé`,
      lien: { ecran: "stock", id: p.produitId },
    };
  },

  acompteModifie(p: { client: string; chambre: string; ancien: string; nouveau: string; par: string; reservationId: string }): MessageNotification {
    return {
      type: "ACOMPTE_MODIFIE",
      titre: "Acompte modifié",
      corps: `${p.par} a changé l'acompte de ${p.client} (ch. ${p.chambre}) : ${p.ancien} → ${p.nouveau}.`,
      lien: { ecran: "reservations", id: p.reservationId },
    };
  },

  chambreAPreparer(p: { chambre: string; chambreId: string }): MessageNotification {
    return {
      type: "CHAMBRE_A_PREPARER",
      titre: "Chambre à préparer",
      corps: `La chambre ${p.chambre} vient d'être libérée.`,
      lien: { ecran: "chambres", id: p.chambreId },
    };
  },

  preEnregistrement(p: { client: string; chambre: string; arrivee: Date; heure: string; reservationId: string }): MessageNotification {
    return {
      type: "PRE_ENREGISTREMENT",
      titre: "Client pré-enregistré",
      corps: `${p.client} · Ch. ${p.chambre} · arrivée le ${dateCourte(p.arrivee)} vers ${p.heure}`,
      lien: { ecran: "reservations", id: p.reservationId },
    };
  },

  reservationAnnulee(p: { client: string; chambre: string; motif: string; reservationId: string; par?: string }): MessageNotification {
    return {
      type: "RESERVATION_ANNULEE",
      titre: "Réservation annulée",
      corps: `${p.client} · Ch. ${p.chambre} — motif : ${p.motif}${p.par ? ` (par ${p.par})` : ""}`,
      lien: { ecran: "reservations", id: p.reservationId },
    };
  },

  recuAnnule(p: { numeroRecu: string; motif: string; par?: string }): MessageNotification {
    return {
      type: "RECU_ANNULE",
      titre: "Reçu annulé",
      corps: `${p.numeroRecu} annulé${p.par ? ` par ${p.par}` : ""} — motif : ${p.motif}`,
      lien: { ecran: "facturation" },
    };
  },

  arriveesDuJour(p: { arrivees: number; departs: number }): MessageNotification {
    const parties = [
      p.arrivees > 0 ? pluriel(p.arrivees, "arrivée", "arrivées") : null,
      p.departs > 0 ? pluriel(p.departs, "départ", "départs") : null,
    ].filter(Boolean);
    return {
      type: "ARRIVEES_DU_JOUR",
      titre: "Aujourd'hui à l'hôtel",
      corps: `${parties.join(" et ")} aujourd'hui`,
      lien: { ecran: "arrivees-departs" },
    };
  },

  departDepasse(p: { client: string; chambre: string; dateDepart: Date; reservationId: string }): MessageNotification {
    return {
      type: "DEPART_DEPASSE",
      titre: "Départ dépassé",
      corps: `${p.client} (Ch. ${p.chambre}) devait partir à ${heureCourte(p.dateDepart)}`,
      lien: { ecran: "reservations", id: p.reservationId },
    };
  },

  recapQuotidien(p: { usd: number; cdf: number }): MessageNotification {
    return {
      type: "RECAP_QUOTIDIEN",
      titre: "Récap du jour",
      corps: `Recette : ${montant(p.usd, "USD")} · ${montant(p.cdf, "CDF")}`,
      lien: { ecran: "tableau-de-bord" },
    };
  },

  licenceBientotExpiree(p: { jours: number }): MessageNotification {
    return {
      type: "LICENCE_BIENTOT_EXPIREE",
      titre: "Abonnement bientôt expiré",
      corps: `Votre abonnement HotelSaver expire dans ${pluriel(p.jours, "jour", "jours")}.`,
      lien: { ecran: "tableau-de-bord" },
    };
  },

  /** Essai jamais payé : les données de l'hôtel seront supprimées (protection contre les essais abusifs, 18/10/2026). */
  suppressionEssaiProche(p: { jours: number; date: string }): MessageNotification {
    return {
      type: "SUPPRESSION_ESSAI_PROCHE",
      titre: "Vos données vont être supprimées",
      corps: `Votre essai est terminé : sans paiement, les données de votre hôtel seront supprimées dans ${pluriel(p.jours, "jour", "jours")} (le ${p.date}). Payez votre abonnement pour les garder.`,
      lien: { ecran: "tableau-de-bord" },
    };
  },

  /** Compte cafétaria annulé par un employé (créé par erreur, rien d'encaissé) : le patron le voit passer (19/10/2026). */
  compteCafeteriaAnnule(p: { tableOuNom: string; par?: string; motif?: string | null; articles: number }): MessageNotification {
    return {
      type: "COMPTE_CAFETERIA_ANNULE",
      titre: "Compte cafétaria annulé",
      corps: `« ${p.tableOuNom} » a été annulé${p.par ? ` par ${p.par}` : ""}${p.articles > 0 ? ` (${pluriel(p.articles, "article remis", "articles remis")} en stock)` : ""}${p.motif ? ` : ${p.motif}` : "."}`,
      lien: { ecran: "tableau-de-bord" },
    };
  },

  licenceSuspendue(): MessageNotification {
    return {
      type: "LICENCE_SUSPENDUE",
      titre: "Abonnement suspendu",
      corps: "Votre abonnement a expiré : renouvelez-le pour rouvrir l'accès à l'application.",
      lien: { ecran: "tableau-de-bord" },
    };
  },

  abonnementRenouvele(p: { jusquau: string; formule: string }): MessageNotification {
    return {
      type: "ABONNEMENT_RENOUVELE",
      titre: "Abonnement renouvelé",
      corps: `Merci ! Votre formule ${p.formule} est active jusqu'au ${p.jusquau}.`,
      lien: { ecran: "tableau-de-bord" },
    };
  },

  acomptePayeEnLigne(p: { client: string; chambre: string; montant: string; reservationId: string; confirmee: boolean }): MessageNotification {
    return {
      type: "ACOMPTE_PAYE_EN_LIGNE",
      titre: "Acompte payé en ligne",
      corps: `${p.client} a payé ${p.montant} pour la chambre ${p.chambre}${p.confirmee ? " : la réservation est confirmée." : "."}`,
      lien: { ecran: "reservations", id: p.reservationId },
    };
  },

  /** Une réservation (ou confirmation) faite hors ligne arrive au serveur alors que la chambre a été prise entre-temps (souvent par un acompte payé en ligne). */
  reservationHorsLigneRefusee(p: { chambre: string; client?: string; reservationId?: string }): MessageNotification {
    return {
      type: "RESERVATION_HORS_LIGNE_REFUSEE",
      titre: "Réservation faite hors ligne refusée",
      corps: `${p.client ? `La réservation de ${p.client}` : "Une réservation"} faite sans connexion n'a pas pu être enregistrée : la chambre ${p.chambre} a été réservée par un autre client entre-temps. Proposez-lui une autre chambre ou d'autres dates.`,
      lien: p.reservationId ? { ecran: "reservations", id: p.reservationId } : { ecran: "reservations" },
    };
  },

  remboursementAFaire(p: { client: string; montant: string; motif: string; reservationId: string }): MessageNotification {
    return {
      type: "REMBOURSEMENT_A_FAIRE",
      titre: "Acompte à rembourser ?",
      corps: `${p.client} avait payé ${p.montant} en ligne (${p.motif}). Décidez : rembourser ou conserver (Réservations → Remboursements).`,
      lien: { ecran: "reservations", id: p.reservationId },
    };
  },

  rapportAGenerer(p: { departement: string; mois: string }): MessageNotification {
    return {
      type: "RAPPORT_A_GENERER",
      titre: `Rapport ${p.departement} à générer`,
      corps: `Le rapport ${p.departement.toLowerCase()} de ${p.mois} est à remettre au patron.`,
      lien: { ecran: "rapports" },
    };
  },

  rapportDisponible(p: { departement: string; mois: string; numero: string }): MessageNotification {
    return {
      type: "RAPPORT_DISPONIBLE",
      titre: `Rapport ${p.departement} de ${p.mois} disponible`,
      corps: `${p.numero} — prêt à consulter et à signer.`,
      lien: { ecran: "rapports" },
    };
  },

  commandeWeb(p: { client: string; articles: number; totalUSD: number; totalCDF: number; compteId: string }): MessageNotification {
    const montants = [
      p.totalUSD > 0 ? montant(p.totalUSD, "USD") : null,
      p.totalCDF > 0 ? montant(p.totalCDF, "CDF") : null,
    ].filter(Boolean);
    return {
      type: "COMMANDE_WEB",
      titre: "Nouvelle commande depuis le site web",
      corps: `${p.client} · ${pluriel(p.articles, "article", "articles")} · ${montants.join(" + ")} — en attente au comptoir`,
      lien: { ecran: "comptes-ouverts", id: p.compteId },
    };
  },
};
