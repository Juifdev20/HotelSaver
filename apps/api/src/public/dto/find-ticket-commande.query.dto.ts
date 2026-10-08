import { IsNotEmpty, IsString } from "class-validator";

export class FindTicketCommandeQueryDto {
  @IsString()
  @IsNotEmpty({ message: "sousDomaine est obligatoire." })
  sousDomaine!: string;
}
