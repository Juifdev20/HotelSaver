import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { PublicService } from "./public.service";
import { CreerDemandeReservationDto } from "./dto/creer-demande-reservation.dto";
import { FindChambresDisponiblesQueryDto } from "./dto/find-chambres-disponibles.query.dto";

/**
 * Aucun guard sur ce contrôleur : section 9.1, le "rôle" CLIENT (site public)
 * n'a pas de compte, donc pas de jeton Supabase Auth à vérifier. Ne JAMAIS
 * ajouter SupabaseAuthGuard/RolesGuard ici.
 */
@Controller("public")
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get("chambres-disponibles")
  findChambresDisponibles(@Query() query: FindChambresDisponiblesQueryDto) {
    return this.publicService.findChambresDisponibles(query);
  }

  @Get("menu")
  findMenu() {
    return this.publicService.findMenu();
  }

  @Post("reservations")
  creerDemandeReservation(@Body() dto: CreerDemandeReservationDto) {
    return this.publicService.creerDemandeReservation(dto);
  }
}
