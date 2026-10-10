import { ConflictException } from "@nestjs/common";

export const MESSAGE_CHEVAUCHEMENT =
  "Cette chambre est déjà réservée sur une partie de cette période. Choisissez d'autres dates ou une autre chambre.";

const NOM_CONTRAINTE = "reservation_chambre_sans_chevauchement";

/** Vrai si l'erreur vient de la contrainte d'exclusion de la base (deux réservations simultanées sur la même chambre). */
export function estViolationChevauchement(erreur: unknown): boolean {
  if (!erreur || typeof erreur !== "object") return false;
  try {
    return JSON.stringify(erreur).includes(NOM_CONTRAINTE) || String((erreur as Error).message ?? "").includes(NOM_CONTRAINTE);
  } catch {
    return String((erreur as Error).message ?? "").includes(NOM_CONTRAINTE);
  }
}

/** Exécute une écriture de réservation et traduit le refus de la base en 409 lisible (le contrôle applicatif ne voit pas les courses). */
export async function sansChevauchement<T>(ecriture: () => Promise<T>): Promise<T> {
  try {
    return await ecriture();
  } catch (erreur) {
    if (estViolationChevauchement(erreur)) throw new ConflictException(MESSAGE_CHEVAUCHEMENT);
    throw erreur;
  }
}
