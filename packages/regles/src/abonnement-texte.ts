/**
 * Textes et calculs d'AFFICHAGE de l'abonnement, partagés par le bureau et le mobile : mêmes mots, mêmes seuils, partout.
 * (La décision d'accès, elle, est toujours celle du serveur — voir `etatAbonnement`.)
 */
import type { EtatAbonnement } from "@hotel-chicago/types";
import { LISTE_OPERATEURS, OPERATEURS_MOBILE_MONEY } from "./mobile-money";

const JOUR_MS = 86_400_000;
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
/** Les hôtels sont en RDC (Lubumbashi, UTC+2, pas d'heure d'été) : une échéance « minuit » s'affiche le bon jour. */
const DECALAGE_LUBUMBASHI_MS = 2 * 3_600_000;

/** « 12 novembre 2026 » (jour calendaire de Lubumbashi). */
export function dateAbonnement(iso: string | Date): string {
  const d = new Date((typeof iso === "string" ? Date.parse(iso) : iso.getTime()) + DECALAGE_LUBUMBASHI_MS);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getUTCDate() === 1 ? "1er" : d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** « 29 $ » / « 81 500 FC » — séparateur de milliers fin, pas de décimales inutiles. */
export function montantAbonnement(montant: number, devise: "USD" | "CDF"): string {
  const entier = Number.isInteger(montant);
  const [e, d] = (entier ? String(montant) : montant.toFixed(2)).split(".");
  const groupes = e.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const nombre = d ? `${groupes},${d}` : groupes;
  return devise === "USD" ? `${nombre} $` : `${nombre} FC`;
}

/** Remet à jour un état reçu il y a un moment (profil mémorisé, application ouverte depuis des heures) : jours restants et alerte suivent l'horloge.
 * `bloque` n'est PAS recalculé ici : seul le serveur coupe l'accès. */
export function actualiserEtatAbonnement(etat: EtatAbonnement, maintenant: Date = new Date()): EtatAbonnement {
  if (etat.statut === "RESILIE" || etat.statut === "SUSPENDU") return etat;
  const joursRestants = Math.ceil((Date.parse(etat.valideJusquau) - maintenant.getTime()) / JOUR_MS);
  const passe = maintenant.getTime() > Date.parse(etat.valideJusquau);
  const finGrace = maintenant.getTime() > Date.parse(etat.graceJusquau);
  const alerte = etat.bloque || finGrace ? "EXPIRE" : passe ? "GRACE" : joursRestants <= 7 ? "BIENTOT" : null;
  const statut = etat.bloque || finGrace ? "EXPIRE" : passe ? "EN_GRACE" : etat.statut === "EN_GRACE" || etat.statut === "EXPIRE" ? etat.statut : etat.statut;
  return { ...etat, joursRestants, alerte, statut };
}

export type NiveauAbonnement = "ok" | "attention" | "danger";

export interface ResumeAbonnement {
  niveau: NiveauAbonnement;
  titre: string;
  detail: string;
}

const jours = (n: number) => `${n} jour${n > 1 ? "s" : ""}`;

/** La carte « Votre abonnement » : une phrase claire sur la situation. */
/** Hôtel jamais payé : « … seront supprimées le X » (protection contre les essais abusifs, 18/10/2026). */
function avisSuppression(etat: EtatAbonnement): string {
  return etat.suppressionLe ? ` Sans paiement, les données de l'hôtel seront supprimées le ${dateAbonnement(etat.suppressionLe)}.` : "";
}

export function resumerAbonnement(etat: EtatAbonnement, formule?: string | null): ResumeAbonnement {
  const fin = dateAbonnement(etat.valideJusquau);
  const nomFormule = formule ? ` (formule ${formule.charAt(0)}${formule.slice(1).toLowerCase()})` : "";
  switch (etat.statut) {
    case "RESILIE":
      return { niveau: "danger", titre: "Abonnement résilié", detail: "Contactez le support HotelSaver pour rouvrir l'accès de votre hôtel." };
    case "SUSPENDU":
      return { niveau: "danger", titre: "Accès suspendu", detail: "L'accès de cet hôtel est suspendu. Contactez le support HotelSaver." };
    case "EXPIRE":
      return etat.suppressionLe
        ? { niveau: "danger", titre: "Abonnement expiré", detail: `Il a pris fin le ${fin}. Payez votre abonnement pour rouvrir l'application.${avisSuppression(etat)}` }
        : { niveau: "danger", titre: "Abonnement expiré", detail: `Il a pris fin le ${fin}. Renouvelez-le pour rouvrir l'application ; vos données sont conservées.` };
    case "EN_GRACE": {
      const restant = Math.max(1, Math.ceil((Date.parse(etat.graceJusquau) - Date.now()) / JOUR_MS));
      return { niveau: "danger", titre: "Abonnement échu", detail: `Il a pris fin le ${fin}. L'accès sera coupé dans ${jours(restant)} si vous ne renouvelez pas.${avisSuppression(etat)}` };
    }
    case "ESSAI":
      return etat.joursRestants <= 7
        ? { niveau: "attention", titre: `Essai gratuit : ${etat.joursRestants <= 1 ? "dernier jour" : `${jours(etat.joursRestants)} restants`}`, detail: `L'essai se termine le ${fin}. Choisissez une formule pour continuer sans interruption.` }
        : { niveau: "ok", titre: `Essai gratuit : ${jours(etat.joursRestants)} restants`, detail: `Toutes les fonctions sont ouvertes jusqu'au ${fin}.` };
    default:
      return etat.joursRestants <= 7
        ? { niveau: "attention", titre: `Se termine ${etat.joursRestants <= 1 ? "demain" : `dans ${jours(etat.joursRestants)}`}`, detail: `Votre abonnement${nomFormule} est payé jusqu'au ${fin}. Renouvelez dès maintenant : les jours restants sont conservés.` }
        : { niveau: "ok", titre: "Abonnement actif", detail: `Payé jusqu'au ${fin}${nomFormule}.` };
  }
}

/** Le bandeau affiché en haut de l'application à TOUS (null = rien à signaler). */
export function bandeauAbonnement(etat: EtatAbonnement | undefined | null, maintenant: Date = new Date()): { niveau: NiveauAbonnement; texte: string } | null {
  if (!etat) return null;
  const e = actualiserEtatAbonnement(etat, maintenant);
  if (!e.alerte || e.alerte === "SUSPENDU" || e.alerte === "RESILIE") return null; // ceux-là bloquent : écran dédié
  const fin = dateAbonnement(e.valideJusquau);
  if (e.alerte === "BIENTOT") return { niveau: "attention", texte: e.statut === "ESSAI" ? `Essai gratuit : plus que ${jours(Math.max(1, e.joursRestants))}. Choisissez une formule.` : `Abonnement : plus que ${jours(Math.max(1, e.joursRestants))} (jusqu'au ${fin}).` };
  if (e.alerte === "GRACE") return { niveau: "danger", texte: `Abonnement échu depuis le ${fin} : l'accès sera bientôt coupé. Renouvelez maintenant.${avisSuppression(e)}` };
  return { niveau: "danger", texte: "Abonnement expiré : renouvelez pour rouvrir l'application." };
}

export const LIBELLE_OPERATEUR: Record<string, string> = Object.fromEntries(LISTE_OPERATEURS.map((o) => [o, OPERATEURS_MOBILE_MONEY[o].libelle]));

/** Contact du support HotelSaver (valeurs de secours ; le super-admin les règle côté serveur et les applications reçoivent les siennes dans `VueAbonnement.contactSupport`). */
export const CONTACT_SUPPORT_PAR_DEFAUT = { telephone: "+243828497218", whatsapp: "+243828497218" };

/** « +243828497218 » → « +243 828 497 218 ». */
export function formaterTelephone(numero: string): string {
  const chiffres = numero.replace(/\D/g, "");
  if (chiffres.length === 12 && chiffres.startsWith("243")) return `+243 ${chiffres.slice(3, 6)} ${chiffres.slice(6, 9)} ${chiffres.slice(9)}`;
  return numero;
}

/** Lien WhatsApp (https://wa.me/…) vers ce numéro, avec un message prérempli facultatif. */
export function lienWhatsApp(numero: string, message?: string): string {
  const chiffres = numero.replace(/\D/g, "");
  return `https://wa.me/${chiffres}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}
