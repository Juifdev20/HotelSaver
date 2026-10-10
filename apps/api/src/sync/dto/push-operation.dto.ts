import { IsDateString, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Min } from "class-validator";
import { TYPES_OPERATION_PUSH, TypeOperationPush } from "../entites-synchronisables";

export class PushOperationDto {
  @IsIn(TYPES_OPERATION_PUSH, { message: `entiteType doit être l'un de : ${TYPES_OPERATION_PUSH.join(", ")}.` })
  entiteType!: TypeOperationPush;

  /** UUID généré côté client (section 10.1), jamais réutilisé par le serveur. */
  @IsString()
  @IsNotEmpty()
  localId!: string;

  /** Obligatoire pour operation = UPDATE (absent pour CREATE : le serveur l'attribue). */
  @IsOptional()
  @IsString()
  remoteId?: string;

  @IsIn(["CREATE", "UPDATE"], { message: "operation doit être CREATE ou UPDATE." })
  operation!: "CREATE" | "UPDATE";

  /**
   * Champs métier de l'entité — volontairement non typé plus finement ici :
   * chaque type d'entité délègue à son propre service existant
   * (ChambresService, ReservationsService, ...), qui applique déjà sa
   * validation habituelle. Une erreur de validation renvoie un statut ERROR
   * pour CETTE opération, sans faire échouer tout le lot.
   */
  @IsObject()
  payload!: Record<string, unknown>;

  /** Obligatoire pour operation = UPDATE : le syncVersion lu localement avant
   * modification, pour la détection de conflit (section 10.4). */
  @IsOptional()
  @IsInt()
  @Min(1)
  baseSyncVersion?: number;

  /** Heure à laquelle l'opération a été faite sur l'appareil (hors ligne : bien avant l'envoi). Sert à dater les
   * écritures qui s'additionnent (mouvement de stock, ligne de commande) à leur vraie heure ; bornée par le serveur. */
  @IsOptional()
  @IsDateString()
  horodatageClient?: string;
}
