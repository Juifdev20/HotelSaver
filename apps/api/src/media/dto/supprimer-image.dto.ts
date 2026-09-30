import { IsUrl } from "class-validator";

export class SupprimerImageDto {
  @IsUrl({ require_tld: false })
  url!: string;
}
