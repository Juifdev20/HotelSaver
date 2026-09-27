import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { PublicService } from "./public.service";
import { CreerDemandeReservationDto } from "./dto/creer-demande-reservation.dto";
import { FindChambresDisponiblesQueryDto } from "./dto/find-chambres-disponibles.query.dto";
import { FindHotelPublicQueryDto } from "./dto/find-hotel-public.query.dto";
import { FindMenuQueryDto } from "./dto/find-menu.query.dto";
import { InscriptionHotelDto } from "./dto/inscription-hotel.dto";

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
  findMenu(@Query() query: FindMenuQueryDto) {
    return this.publicService.findMenu(query);
  }

  @Get("hotel")
  obtenirInfoPublique(@Query() query: FindHotelPublicQueryDto) {
    return this.publicService.obtenirInfoPublique(query);
  }

  @Post("reservations")
  creerDemandeReservation(@Body() dto: CreerDemandeReservationDto) {
    return this.publicService.creerDemandeReservation(dto);
  }

  @Post("hotels/inscription")
  inscrireHotel(@Body() dto: InscriptionHotelDto) {
    return this.publicService.inscrireHotel(dto);
  }
}
