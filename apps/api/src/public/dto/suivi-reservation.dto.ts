import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";

/** `?sousDomaine=` : la réservation doit appartenir à l'hôtel du site
 * consulté — sinon 404 uniforme, comme toute route publique. */
export class SuiviReservationQueryDto {
  @IsString()
  @IsNotEmpty({ message: "sousDomaine est obligatoire." })
  sousDomaine!: string;
}

export class AnnulerReservationPubliqueDto {
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: "Le motif ne peut pas dépasser 300 caractères." })
  motif?: string;
}

export const TYPES_PIECE = ["CNI", "PASSEPORT", "PERMIS", "AUTRE"] as const;

export class PreEnregistrementDto {
  @IsIn(TYPES_PIECE, { message: "Le type de pièce doit être CNI, PASSEPORT, PERMIS ou AUTRE." })
  typePiece!: (typeof TYPES_PIECE)[number];

  @IsString()
  @Length(3, 40, { message: "Le numéro de pièce doit faire entre 3 et 40 caractères." })
  numeroPiece!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "L'heure d'arrivée doit être au format HH:MM (ex. 14:30)." })
  heureArriveePrevue!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "Les demandes spéciales ne peuvent pas dépasser 500 caractères." })
  demandeClient?: string;

  @IsOptional()
  @IsEmail({}, { message: "L'adresse email n'est pas valide." })
  email?: string;

  @IsOptional()
  @IsString()
  @Length(6, 30, { message: "Le numéro de téléphone n'est pas valide." })
  telephone?: string;
}
