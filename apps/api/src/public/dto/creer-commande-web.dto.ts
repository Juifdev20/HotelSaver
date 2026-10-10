import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

class ClientCommandeWebDto {
  @IsString()
  @IsNotEmpty({ message: "Le nom du client est obligatoire." })
  @MaxLength(80)
  nom!: string;

  /** Téléphone/WhatsApp — le client s'identifie au comptoir avec ces coordonnées. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telephone?: string;

  /** N° de chambre si le client est un invité de l'hôtel. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  chambre?: string;

  /** Instruction globale (ex. « sans piment »). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

class LigneCommandeWebDto {
  @IsUUID(undefined, { message: "produitId doit être un identifiant valide." })
  produitId!: string;

  @Type(() => Number)
  @IsInt({ message: "La quantité doit être un nombre entier." })
  @Min(1, { message: "La quantité minimale est 1." })
  @Max(50, { message: "La quantité maximale par article est 50." })
  quantite!: number;

  /** Instruction propre à l'article (ex. « bien cuit »). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/**
 * POST /public/commande — commande passée par un visiteur anonyme du site
 * public. Plafonds volontairement stricts (endpoint sans authentification) :
 * une commande = max 20 articles différents, 50 unités chacun. Les prix ne
 * sont JAMAIS repris du client : seuls produitId/quantite/note transitent.
 */
export class CreerCommandeWebDto {
  @IsString()
  @IsNotEmpty({ message: "L'identifiant de l'hôtel est obligatoire." })
  sousDomaine!: string;

  @ValidateNested()
  @Type(() => ClientCommandeWebDto)
  client!: ClientCommandeWebDto;

  @IsArray()
  @ArrayMinSize(1, { message: "La commande doit contenir au moins un article." })
  @ArrayMaxSize(20, { message: "La commande ne peut pas dépasser 20 articles différents." })
  @ValidateNested({ each: true })
  @Type(() => LigneCommandeWebDto)
  lignes!: LigneCommandeWebDto[];

  /** Jeton du widget anti-robot (vérifié par CaptchaGuard, jamais enregistré). */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}
