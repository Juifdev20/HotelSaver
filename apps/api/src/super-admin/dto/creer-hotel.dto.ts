import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";

export class CreerHotelDto {
  @IsString()
  @IsNotEmpty({ message: "Le nom de l'hôtel est obligatoire." })
  nom!: string;

  @IsString()
  @IsNotEmpty({ message: "Le sous-domaine est obligatoire." })
  sousDomaine!: string;

  @IsOptional()
  @IsEmail({}, { message: "L'email de contact doit être une adresse valide." })
  emailContact?: string;

  @IsOptional()
  @IsString()
  telephoneContact?: string;

  @IsOptional()
  @IsString()
  adresse?: string;

  @IsOptional()
  @IsUrl({}, { message: "logoUrl doit être une URL valide (Supabase Storage)." })
  logoUrl?: string;
}
