import { dateAbonnement, etatAbonnement, finValidite, formuleParCode } from "@hotel-chicago/regles";
import type { FormuleAbonnement } from "@hotel-chicago/regles";
import type { EtatAbonnement, HotelAvecValidite } from "@hotel-chicago/types";
import type { StatusTone } from "@hotel-chicago/ui";

/**
 * Un hôtel tel que GET /super-admin/hotels le renvoie : l'hôtel complet (modèle Prisma Hotel) + `valideJusquau`.
 * `formule` et `suspensionManuelle` y figurent bien, mais le type partagé `HotelAvecValidite` ne les déclare pas encore :
 * on les ajoute ici, en optionnel (une ancienne version du serveur peut ne pas les envoyer).
 */
export interface HotelListe extends HotelAvecValidite {
  /** Formule payée en dernier ; null = essai ou hôtel créé à la main. */
  formule?: string | null;
  /** true = suspendu À LA MAIN : l'hôtel ne peut pas se réactiver en payant. */
  suspensionManuelle?: boolean;
  /** Nombre de chambres de l'hôtel, si le serveur le fournit (sinon on n'affiche que le plafond de la formule). */
  nombreChambres?: number;
}

export interface BadgeAbonnement {
  libelle: string;
  tone: StatusTone;
  /** Phrase d'aide (infobulle / lecteur d'écran). */
  aide: string;
}

/** Même calcul que le serveur (etatAbonnement), à partir de ce que la liste fournit : date de création, statut, marque « à la main » et fin de validité. */
export function etatAbonnementHotel(hotel: HotelListe, maintenant: Date = new Date()): EtatAbonnement {
  const fin = new Date(hotel.valideJusquau);
  const creation = { createdAt: new Date(hotel.createdAt) };
  // La liste ne donne pas le dernier paiement, seulement la fin de validité : si elle diffère de la fin d'essai, c'est qu'un paiement existe.
  const aPaye = Math.abs(finValidite(creation, null).getTime() - fin.getTime()) > 1000;
  return etatAbonnement(
    { createdAt: creation.createdAt, statutLicence: hotel.statutLicence, suspensionManuelle: hotel.suspensionManuelle },
    aPaye ? { periodeCouverteJusquau: fin } : null,
    maintenant
  );
}

export function badgeAbonnement(hotel: HotelListe, maintenant: Date = new Date()): BadgeAbonnement {
  // Serveur plus ancien (pas de marque « à la main ») : on ne devine pas la cause d'une suspension.
  if (hotel.statutLicence === "SUSPENDU" && hotel.suspensionManuelle === undefined) {
    return { libelle: "Suspendu", tone: "danger", aide: "Suspendu : échéance dépassée ou suspension manuelle." };
  }
  const etat = etatAbonnementHotel(hotel, maintenant);
  switch (etat.statut) {
    case "RESILIE":
      return { libelle: "Résilié", tone: "danger", aide: "Accès fermé. Seul le support peut le rouvrir." };
    case "SUSPENDU":
      return { libelle: "Suspendu à la main", tone: "danger", aide: "Suspension manuelle : l'hôtel ne peut pas se réactiver en payant." };
    case "EXPIRE":
      return { libelle: "Expiré", tone: "danger", aide: "Échéance dépassée de plus de 3 jours : accès bloqué jusqu'au prochain paiement." };
    case "EN_GRACE":
      return { libelle: "En grâce", tone: "warning", aide: "Échéance dépassée depuis moins de 3 jours : l'hôtel travaille encore, avec une alerte." };
    case "ESSAI":
      return { libelle: "Essai", tone: "info", aide: "Période d'essai gratuite en cours." };
    default:
      return { libelle: "Actif", tone: "success", aide: "Abonnement payé et à jour." };
  }
}

/** Nom de la formule (jamais son code) ; `formules` = le catalogue courant défini par le super-admin. */
export function libelleFormule(formule: string | null | undefined, formules?: FormuleAbonnement[]): string {
  if (!formule) return "—";
  return formuleParCode(formule, formules)?.nom ?? formule;
}

/** « 12 novembre 2026 » (jour de Lubumbashi, comme dans les applications). */
export function dateFin(hotel: HotelListe): string {
  return dateAbonnement(hotel.valideJusquau);
}
