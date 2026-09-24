import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, ValidateNested } from "class-validator";
import { PushOperationDto } from "./push-operation.dto";

export class SyncPushDto {
  @IsArray()
  @ArrayMinSize(1, { message: "operations ne peut pas être vide." })
  @ValidateNested({ each: true })
  @Type(() => PushOperationDto)
  operations!: PushOperationDto[];
}
