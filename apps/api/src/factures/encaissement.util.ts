import { BadRequestException } from "@nestjs/common";
import { ErreurRegle, calculerEncaissement as calculerRegle } from "@hotel-chicago/regles";
import type { EncaissementInput, EncaissementResult } from "@hotel-chicago/regles";

export type { EncaissementInput, EncaissementResult };

/**
 * Calcule la monnaie à rendre lors d'un encaissement, y compris le cas du paiement croisé (section 9.4). Le calcul lui-même vit
 * dans `@hotel-chicago/regles` (partagé avec les applications hors ligne, qui affichent le même résultat à la caisse) ; ici on
 * ne fait que transformer une règle non respectée en erreur HTTP 400.
 */
export function calculerEncaissement(input: EncaissementInput): EncaissementResult {
  try {
    return calculerRegle(input);
  } catch (error) {
    if (error instanceof ErreurRegle) throw new BadRequestException(error.message);
    throw error;
  }
}
