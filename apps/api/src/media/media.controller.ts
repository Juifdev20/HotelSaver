import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Role } from "@hotel-chicago/types";
import type { UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { MediaService } from "./media.service";
import { EnvoiImageQueryDto } from "./dto/envoi-image.query.dto";
import { SupprimerImageDto } from "./dto/supprimer-image.dto";
import { TAILLE_MAX_ENVOI_OCTETS } from "./traiter-image";

/** Images des chambres et du site de l'hôtel : PATRON seulement (c'est lui qui
 * définit la vitrine de son hôtel). */
@Controller("media")
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /** multipart/form-data, champ `fichier`. Répond `{ url }` — l'URL est ensuite
   * rattachée à une chambre (`photos`) ou au site (`couvertureUrl`/`galerie`). */
  @Post("images")
  @Roles(Role.PATRON)
  @UseInterceptors(FileInterceptor("fichier", { limits: { fileSize: TAILLE_MAX_ENVOI_OCTETS, files: 1 } }))
  async envoyer(
    @UploadedFile() fichier: Express.Multer.File | undefined,
    @Query() query: EnvoiImageQueryDto,
    @CurrentUser() currentUser: UtilisateurAuthentifie
  ) {
    if (!fichier) throw new BadRequestException("Aucun fichier reçu (champ « fichier »).");
    return this.mediaService.envoyerImage(currentUser.hotelId, fichier.buffer, query.usage);
  }

  @Delete("images")
  @Roles(Role.PATRON)
  async supprimer(@Body() dto: SupprimerImageDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    await this.mediaService.supprimerImage(currentUser.hotelId, dto.url);
    return { supprimee: true };
  }
}
