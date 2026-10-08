/**
 * Section 7 : ces 9 tables portent `updatedAt`/`syncVersion`. Client ajouté
 * en Phase 16 (pull uniquement — un Client naît toujours implicitement dans
 * le payload `client` inline d'un CREATE Reservation, jamais en push
 * direct ; `updatedAt`/`syncVersion` ajoutés par migration pour le curseur
 * incrémental). Facture et
 * VenteCafeteria sont lisibles via GET /sync/pull (un appareil doit connaître
 * les factures/ventes créées par d'autres postes), mais volontairement
 * exclues de POST /sync/push : leur création implique un calcul serveur
 * complexe (numeroRecu séquentiel, montants multi-devises, intégration
 * cafétaria → facture chambre) qui ne se prête pas à un passthrough
 * générique, et le préfixe TEMP- de réimpression décrit section 11.3 (pour
 * les tickets créés hors ligne avant synchronisation) n'a pas encore de
 * consommateur réel (aucune app Electron/mobile hors ligne construite à ce
 * stade) — voir DECISIONS.md.
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
] as const;
export type EntitePush = (typeof ENTITES_PUSH)[number];

export const ENTITES_PULL = [...ENTITES_PUSH, "Client", "Facture", "VenteCafeteria"] as const;
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
