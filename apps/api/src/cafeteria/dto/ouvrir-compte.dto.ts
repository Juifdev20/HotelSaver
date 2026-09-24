import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class OuvrirCompteDto {
  @IsString()
  @IsNotEmpty({ message: "Le nom de la table ou du client est obligatoire." })
  tableOuNom!: string;

  /** Un compte ouvert doit toujours avoir au moins un sous-compte pour
   * pouvoir y ajouter des lignes (section 9.2) — celui-ci est créé
   * automatiquement pour éviter une étape manuelle supplémentaire au
   * cas courant (une seule personne). Voir DECISIONS.md. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nomPremierSousCompte?: string;
}
