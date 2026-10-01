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

  chambreAPreparer(p: { chambre: string; chambreId: string }): MessageNotification {
    return {
      type: "CHAMBRE_A_PREPARER",
      titre: "Chambre à préparer",
      corps: `La chambre ${p.chambre} vient d'être libérée.`,
      lien: { ecran: "chambres", id: p.chambreId },
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

  licenceSuspendue(): MessageNotification {
    return {
      type: "LICENCE_SUSPENDUE",
      titre: "Abonnement suspendu",
      corps: "Votre abonnement a expiré : renouvelez-le pour rouvrir l'accès à l'application.",
      lien: { ecran: "tableau-de-bord" },
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
};
