/**
 * Acomptes encaissés par la réception, à compter dans la recette du jour.
 *
 * Pourquoi : l'acompte est remis au moment de l'enregistrement du client, mais la facture (« reste à payer ») n'est créée qu'au départ.
 * Un séjour payé d'avance a donc une facture à 0 : sans cette règle, l'argent réellement encaissé n'apparaissait dans aucun tableau
 * de bord (réception ni patron). L'acompte est compté le jour où la réservation est créée (c'est là que l'argent est pris), dans la
 * devise de la chambre, au nom de la personne qui l'a enregistrée. Le reste payé au départ est déjà dans la facture : aucun
 * doublon possible, la facture ne contient jamais l'acompte.
 *
 * Même fonction côté serveur (tableau de bord) et côté appareil (hors ligne) : les deux affichent le même chiffre.
 */
export interface ReservationPourRecette {
  acompte: number;
  devise: "USD" | "CDF";
  statut: string;
  origine: string;
  creePar: string;
  creeLe: Date | string;
  annulee?: boolean;
}

export function acomptesEncaisses(
  reservations: ReservationPourRecette[],
  fenetre: { debut: Date | string; fin?: Date | string },
  /** `null` = tout l'hôtel (patron) ; sinon, seulement ce que cet utilisateur a encaissé. */
  parUtilisateur: string | null
): { montantUSD: number; montantCDF: number } {
  const t = (v: Date | string) => new Date(v).getTime();
  const debut = t(fenetre.debut);
  const fin = fenetre.fin === undefined ? Infinity : t(fenetre.fin);
  const somme = { montantUSD: 0, montantCDF: 0 };
  for (const r of reservations) {
    // Un acompte en ligne passe par le paiement du site, pas par la caisse de la réception ; une réservation annulée est remboursée.
    if (r.origine !== "RECEPTION" || r.statut === "ANNULEE" || r.annulee) continue;
    if (parUtilisateur !== null && r.creePar !== parUtilisateur) continue;
    const quand = t(r.creeLe);
    // Date absente ou illisible (ancienne copie locale d'avant la migration) : on ne devine pas, on ne compte pas.
    if (!Number.isFinite(quand) || quand < debut || quand >= fin) continue;
    const montant = Number(r.acompte);
    if (!Number.isFinite(montant) || montant <= 0) continue;
    if (r.devise === "USD") somme.montantUSD += montant;
    else somme.montantCDF += montant;
  }
  return somme;
}
