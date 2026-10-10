import { Body, Controller, Get, Param, Post, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CaptchaGuard } from "../common/captcha/captcha.guard";
import {
  LIMITE_ECRITURE_PUBLIQUE,
  LIMITE_INSCRIPTION,
  LIMITE_MOT_DE_PASSE_OUBLIE,
} from "../common/throttle/throttle.config";
import { PublicService } from "./public.service";
import { CreerCommandeWebDto } from "./dto/creer-commande-web.dto";
import { CreerDemandeReservationDto } from "./dto/creer-demande-reservation.dto";
import { FindChambresDisponiblesQueryDto } from "./dto/find-chambres-disponibles.query.dto";
import { FindHotelPublicQueryDto } from "./dto/find-hotel-public.query.dto";
import { FindMenuQueryDto } from "./dto/find-menu.query.dto";
import { FindTicketCommandeQueryDto } from "./dto/find-ticket-commande.query.dto";
import { InscriptionHotelDto } from "./dto/inscription-hotel.dto";
import { MotDePasseOublieDto } from "./dto/mot-de-passe-oublie.dto";
import { ReinitialiserMotDePasseDto } from "./dto/reinitialiser-mot-de-passe.dto";
import { AnnulerReservationPubliqueDto, PreEnregistrementDto, SuiviReservationQueryDto } from "./dto/suivi-reservation.dto";

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

  @Throttle(LIMITE_ECRITURE_PUBLIQUE)
  @UseGuards(CaptchaGuard)
  @Post("reservations")
  creerDemandeReservation(@Body() dto: CreerDemandeReservationDto) {
    return this.publicService.creerDemandeReservation(dto);
  }

  /** Page « Ma réservation » : le jeton secret du lien suffit (pas de compte
   * client) ; `?sousDomaine=` doit désigner l'hôtel de la réservation. */
  @Get("suivi/:jeton")
  obtenirSuiviReservation(@Param("jeton") jeton: string, @Query() query: SuiviReservationQueryDto) {
    return this.publicService.obtenirSuiviReservation(jeton, query);
  }

  @Post("suivi/:jeton/annuler")
  annulerReservationPublique(
    @Param("jeton") jeton: string,
    @Query() query: SuiviReservationQueryDto,
    @Body() dto: AnnulerReservationPubliqueDto
  ) {
    return this.publicService.annulerReservationPublique(jeton, query, dto);
  }

  @Post("suivi/:jeton/pre-enregistrement")
  preEnregistrer(@Param("jeton") jeton: string, @Query() query: SuiviReservationQueryDto, @Body() dto: PreEnregistrementDto) {
    return this.publicService.preEnregistrer(jeton, query, dto);
  }

  /** Commande cafétéria passée depuis la page « Cuisine » du site public —
   * l'hôtel doit avoir activé `commandeWebActivee` (404 uniforme sinon). */
  @Throttle(LIMITE_ECRITURE_PUBLIQUE)
  @UseGuards(CaptchaGuard)
  @Post("commande")
  creerCommandeWeb(@Body() dto: CreerCommandeWebDto) {
    return this.publicService.creerCommandeWeb(dto);
  }

  /** Ticket PDF de la commande web — téléchargé depuis l'écran de
   * confirmation du site. Public : le client n'a pas de compte ; l'accès est
   * restreint aux commandes SITE_PUBLIC de l'hôtel (UUID non devinable). */
  @Get("commande/:compteId/ticket")
  async telechargerTicket(@Param("compteId") compteId: string, @Query() query: FindTicketCommandeQueryDto) {
    const pdf = await this.publicService.genererTicketCommandeWeb(compteId, query);
    return new StreamableFile(pdf, {
      type: "application/pdf",
      disposition: `attachment; filename="ticket-${compteId.slice(0, 8)}.pdf"`,
    });
  }

  @Throttle(LIMITE_MOT_DE_PASSE_OUBLIE)
  @Post("mot-de-passe-oublie")
  motDePasseOublie(@Body() dto: MotDePasseOublieDto) {
    return this.publicService.demanderReinitialisation(dto);
  }

  @Throttle(LIMITE_MOT_DE_PASSE_OUBLIE)
  @Post("reinitialiser-mot-de-passe")
  reinitialiserMotDePasse(@Body() dto: ReinitialiserMotDePasseDto) {
    return this.publicService.reinitialiserMotDePasse(dto);
  }

  // Pas de CAPTCHA ici : l'inscription se fait aussi depuis le bureau et le mobile (qui ne peuvent pas afficher le widget). Protégée par la
  // limitation de débit, le contrôle des noms réservés et la confirmation par e-mail de Supabase.
  @Throttle(LIMITE_INSCRIPTION)
  @Post("hotels/inscription")
  inscrireHotel(@Body() dto: InscriptionHotelDto) {
    return this.publicService.inscrireHotel(dto);
  }
}
