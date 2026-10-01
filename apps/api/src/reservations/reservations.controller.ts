import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ReservationsService } from "./reservations.service";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { UpdateReservationDto } from "./dto/update-reservation.dto";
import { AnnulerReservationDto } from "./dto/annuler-reservation.dto";
import { FindReservationsQueryDto } from "./dto/find-reservations.query.dto";

/**
 * Permissions (section 9.3 "Réservations" + "Check-in/Check-out", lues avec
 * "PATRON : accès total" de la section 9.1 — voir DECISIONS.md) :
 * RECEPTIONNISTE et PATRON ont tous deux accès à toutes les actions.
 * CAFETARIA n'a aucun accès à ce module.
 */
@Controller("reservations")
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(Role.RECEPTIONNISTE, Role.PATRON)
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  findAll(@Query() query: FindReservationsQueryDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.reservationsService.findAll(query, currentUser.hotelId);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.reservationsService.findOne(id, currentUser.hotelId);
  }

  @Post()
  create(@Body() dto: CreateReservationDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.reservationsService.create(dto, currentUser);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateReservationDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.reservationsService.update(id, dto, currentUser.hotelId);
  }

  @Post(":id/confirmer")
  confirmer(@Param("id") id: string, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.reservationsService.confirmer(id, currentUser.hotelId);
  }

  @Post(":id/annuler")
  annuler(@Param("id") id: string, @Body() dto: AnnulerReservationDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.reservationsService.annuler(id, dto, currentUser.hotelId, currentUser);
  }

  @Post(":id/check-in")
  checkIn(@Param("id") id: string, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.reservationsService.checkIn(id, currentUser.hotelId);
  }

  @Post(":id/check-out")
  checkOut(@Param("id") id: string, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.reservationsService.checkOut(id, currentUser.hotelId);
  }
}
