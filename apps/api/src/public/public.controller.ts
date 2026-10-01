import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { PublicService } from "./public.service";
import { CreerDemandeReservationDto } from "./dto/creer-demande-reservation.dto";
import { FindChambresDisponiblesQueryDto } from "./dto/find-chambres-disponibles.query.dto";
import { FindHotelPublicQueryDto } from "./dto/find-hotel-public.query.dto";
import { FindMenuQueryDto } from "./dto/find-menu.query.dto";
import { InscriptionHotelDto } from "./dto/inscription-hotel.dto";
import { MotDePasseOublieDto } from "./dto/mot-de-passe-oublie.dto";
import { ReinitialiserMotDePasseDto } from "./dto/reinitialiser-mot-de-passe.dto";

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

  @Get("hotels-partenaires")
  listerHotelsPartenaires() {
    return this.publicService.listerHotelsPartenaires();
  }

  @Post("reservations")
  creerDemandeReservation(@Body() dto: CreerDemandeReservationDto) {
    return this.publicService.creerDemandeReservation(dto);
  }

  @Post("mot-de-passe-oublie")
  motDePasseOublie(@Body() dto: MotDePasseOublieDto) {
    return this.publicService.demanderReinitialisation(dto);
  }

  @Post("reinitialiser-mot-de-passe")
  reinitialiserMotDePasse(@Body() dto: ReinitialiserMotDePasseDto) {
    return this.publicService.reinitialiserMotDePasse(dto);
  }

  @Post("hotels/inscription")
  inscrireHotel(@Body() dto: InscriptionHotelDto) {
    return this.publicService.inscrireHotel(dto);
  }
}
