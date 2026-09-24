import { IsNotEmpty, IsString } from "class-validator";

export class AjouterSousCompteDto {
  @IsString()
  @IsNotEmpty({ message: "Le nom de la personne est obligatoire." })
  nom!: string;
}
