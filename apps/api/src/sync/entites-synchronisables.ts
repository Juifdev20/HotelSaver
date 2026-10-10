/**
 * Section 7 : tables synchronisées (elles portent `updatedAt`/`syncVersion`). `Client` : lecture seule (il naît toujours
 * implicitement dans le payload `client` d'un CREATE Reservation). `Facture` et `VenteCafeteria` : créées hors ligne par un ordre
 * d'encaissement que le serveur recalcule entièrement (voir DECISIONS.md, 10/10/2026).
 */
export const ENTITES_PUSH = [
  "Chambre",
  "Reservation",
  "Produit",
  "MouvementStock",
  "CompteCafeteria",
  "SousCompte",
  "LigneCommande",
  // Dépenses (07/10/2026) : saisies hors ligne sur mobile par la réception et la cafétaria.
  "Depense",
  // Encaissements hors ligne (10/10/2026) : le serveur recalcule tout (totaux, taux, numéro de reçu définitif) ; l'appareil
  // n'envoie que l'intention (mode de paiement, devise remise…) et le numéro du reçu provisoire qu'il a remis au client.
  "Facture",
  "VenteCafeteria",
  // Fiche client (pièce d'identité, coordonnées) : modifiable hors ligne, jamais créée directement (elle naît dans une réservation).
  "Client",
] as const;
export type EntitePush = (typeof ENTITES_PUSH)[number];

/**
 * Actions qui font évoluer une ligne existante sans être une création ni une simple modification de champs
 * (check-in, annulation, avancement en cuisine…). Elles voyagent dans la file comme les autres opérations (CREATE d'un
 * « ordre »), sont rejouables sans effet double, et le serveur applique ses règles habituelles : un ordre devenu
 * impossible (réservation annulée entre-temps) est refusé avec son motif, jamais forcé.
 */
export const COMMANDES_PUSH = ["ActionReservation", "ActionLigne"] as const;
export type CommandePush = (typeof COMMANDES_PUSH)[number];

/** Tout ce que POST /sync/push accepte. */
export const TYPES_OPERATION_PUSH = [...ENTITES_PUSH, ...COMMANDES_PUSH] as const;
export type TypeOperationPush = (typeof TYPES_OPERATION_PUSH)[number];

export const ACTIONS_RESERVATION = ["CONFIRMER", "ANNULER", "CHECK_IN", "CHECK_OUT"] as const;
export type ActionReservation = (typeof ACTIONS_RESERVATION)[number];

export const ENTITES_PULL = [...ENTITES_PUSH] as const;
export type EntitePull = (typeof ENTITES_PULL)[number];

/** Nom de l'accesseur PrismaClient correspondant à chaque type d'entité. */
export const ACCESSEUR_PRISMA: Record<EntitePull, string> = {
  Chambre: "chambre",
  Reservation: "reservation",
  Produit: "produit",
  MouvementStock: "mouvementStock",
  Client: "client",
  CompteCafeteria: "compteCafeteria",
  SousCompte: "sousCompte",
  LigneCommande: "ligneCommande",
  Facture: "facture",
  VenteCafeteria: "venteCafeteria",
  Depense: "depense",
};
