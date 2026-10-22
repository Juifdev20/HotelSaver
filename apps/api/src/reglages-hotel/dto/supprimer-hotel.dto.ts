import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export const RAISONS_SUPPRESSION = ["plus_utilise", "trop_cher", "probleme_technique", "hotel_ferme", "autre_logiciel", "autre"] as const;
export type RaisonSuppression = (typeof RAISONS_SUPPRESSION)[number];

export class SupprimerHotelDto {
  @IsIn(RAISONS_SUPPRESSION as unknown as string[], { message: "Choisissez la raison de votre départ." })
  raison!: RaisonSuppression;

  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: "1000 caractères au plus." })
  commentaire?: string;

  /** Le nom de l'hôtel, retapé : on ne supprime pas un hôtel d'un clic. */
  @IsString({ message: "Retapez le nom de votre hôtel pour confirmer." })
  @MinLength(1, { message: "Retapez le nom de votre hôtel pour confirmer." })
  @MaxLength(200)
  confirmationNom!: string;
}
