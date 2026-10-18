import { IsOptional, IsString, MaxLength } from "class-validator";

/** Annulation d'un compte cafétaria créé par erreur (19/10/2026) : motif facultatif, gardé pour la trace. */
export class AnnulerCompteDto {
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: "Le motif ne doit pas dépasser 300 caractères." })
  motif?: string;
}
