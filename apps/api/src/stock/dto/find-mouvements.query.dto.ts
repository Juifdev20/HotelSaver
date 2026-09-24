import { IsOptional, IsUUID } from "class-validator";

export class FindMouvementsQueryDto {
  @IsOptional()
  @IsUUID()
  produitId?: string;
}
