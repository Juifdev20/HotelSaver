import { Type } from "class-transformer";
import { IsInt, IsISO8601, IsOptional, Max, Min } from "class-validator";

export class ListerNotificationsQueryDto {
  /** Seulement les notifications créées après cet instant (ISO 8601) — sert à l'interrogation périodique. */
  @IsOptional()
  @IsISO8601()
  depuis?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}