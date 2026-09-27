import { StatutLicence } from "@hotel-chicago/database";
import { IsEnum } from "class-validator";

export class ChangerStatutHotelDto {
  @IsEnum(StatutLicence, { message: "statutLicence doit être ESSAI, ACTIF, SUSPENDU ou RESILIE." })
  statutLicence!: StatutLicence;
}
