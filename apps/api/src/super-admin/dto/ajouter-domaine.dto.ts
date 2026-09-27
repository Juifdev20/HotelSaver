import { IsFQDN } from "class-validator";

export class AjouterDomaineDto {
  @IsFQDN({}, { message: "domaine doit être un nom de domaine valide (ex. www.hotel-chicago.com)." })
  domaine!: string;
}
