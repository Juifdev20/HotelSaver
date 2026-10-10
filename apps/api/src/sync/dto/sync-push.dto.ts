import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from "class-validator";
import { PushOperationDto } from "./push-operation.dto";

export class SyncPushDto {
  @IsArray()
  @ArrayMinSize(1, { message: "operations ne peut pas être vide." })
  @ArrayMaxSize(200, { message: "Au plus 200 opérations par envoi : envoyez le reste dans un second lot." })
  @ValidateNested({ each: true })
  @Type(() => PushOperationDto)
  operations!: PushOperationDto[];
}
