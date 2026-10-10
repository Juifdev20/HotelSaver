/**
 * Textes lisibles pour l'écran Synchronisation : un conflit ou une action refusée est décrit avec les NOMS de champs en français
 * (« Prix par nuit : 50 »), jamais en JSON brut.
 */

const LIBELLE_CHAMP: Record<string, string> = {
  nom: "Nom",
  numero: "Numéro",
  type: "Type",
  prixParNuit: "Prix par nuit",
  prix: "Prix",
  prixAchat: "Prix d'achat",
  devise: "Devise",
  statut: "Statut",
  photo: "Photo",
  photos: "Photos",
  categorie: "Catégorie",
  stockActuel: "Stock actuel",
  seuilAlerte: "Seuil d'alerte",
  actif: "Actif",
  description: "Description",
  commandableEnLigne: "Commandable sur le site",
  portionsDisponibles: "Portions disponibles",
  codeBarres: "Code-barres",
  telephone: "Téléphone",
  email: "E-mail",
  typePiece: "Type de pièce",
  numeroPiece: "N° de pièce",
  notes: "Notes",
  note: "Note",
  dateArrivee: "Date d'arrivée",
  dateDepart: "Date de départ",
  acompte: "Acompte",
  motif: "Motif",
  motifAnnulation: "Motif d'annulation",
  montant: "Montant",
  quantite: "Quantité",
  tableOuNom: "Table ou nom",
  modePaiement: "Mode de paiement",
  deviseRegleeParClient: "Devise remise par le client",
  montantRegleParClient: "Montant remis",
  deviseRenduChoisie: "Devise de la monnaie",
  heureArriveePrevue: "Heure d'arrivée prévue",
  demandeClient: "Demande du client",
  reponseReception: "Réponse de la réception",
  date: "Date",
  departement: "Département",
};

/** Champs purement techniques : jamais montrés à l'utilisateur. */
const CHAMPS_TECHNIQUES = new Set(["id", "hotelId", "syncVersion", "updatedAt", "createdAt", "localId", "remoteId", "baseSyncVersion"]);

const LIBELLE_VALEUR: Record<string, string> = {
  CASH: "Espèces",
  MOBILE_MONEY: "Mobile money",
  USD: "USD ($)",
  CDF: "CDF (FC)",
  LIBRE: "Libre",
  OCCUPEE: "Occupée",
  RESERVEE: "Réservée",
  NETTOYAGE: "Nettoyage",
  MAINTENANCE: "Maintenance",
  EN_ATTENTE: "En attente",
  CONFIRMEE: "Confirmée",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
  ANNULEE: "Annulée",
};

function libelleChamp(cle: string): string {
  if (LIBELLE_CHAMP[cle]) return LIBELLE_CHAMP[cle]!;
  // Repli : « prixParNuit » -> « Prix par nuit » (jamais d'identifiant technique brut).
  const mots = cle.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return mots.charAt(0).toUpperCase() + mots.slice(1);
}

function libelleValeur(valeur: unknown): string {
  if (valeur === null || valeur === undefined || valeur === "") return "(vide)";
  if (typeof valeur === "boolean") return valeur ? "Oui" : "Non";
  if (typeof valeur === "number") return String(valeur);
  if (typeof valeur === "string") {
    if (LIBELLE_VALEUR[valeur]) return LIBELLE_VALEUR[valeur]!;
    if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(valeur)) {
      const d = new Date(valeur);
      if (!Number.isNaN(d.getTime())) {
        return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Lubumbashi" }).format(d);
      }
    }
    return valeur;
  }
  if (Array.isArray(valeur)) return valeur.length === 0 ? "(vide)" : `${valeur.length} élément${valeur.length > 1 ? "s" : ""}`;
  return "(détail technique)";
}

/** « Prix par nuit : 50 · Statut : Libre » — vide si aucun champ lisible. */
export function decrireChangement(changement: unknown): string {
  if (!changement || typeof changement !== "object") return "";
  return Object.entries(changement as Record<string, unknown>)
    .filter(([cle, valeur]) => !CHAMPS_TECHNIQUES.has(cle) && typeof valeur !== "function")
    .map(([cle, valeur]) => `${libelleChamp(cle)} : ${libelleValeur(valeur)}`)
    .join(" · ");
}

/** Message d'erreur du serveur rendu présentable : jamais de JSON brut ni de trace technique. */
export function messageLisible(erreur: string | null | undefined, repli = "Refusée."): string {
  if (!erreur) return repli;
  const texte = erreur.trim();
  if (texte.startsWith("{") || texte.startsWith("[")) {
    try {
      const objet = JSON.parse(texte) as { message?: unknown };
      const m = Array.isArray(objet.message) ? objet.message.join(" ; ") : objet.message;
      if (typeof m === "string" && m) return m;
    } catch {
      // Texte non JSON : traité plus bas.
    }
    return repli;
  }
  return texte;
}
