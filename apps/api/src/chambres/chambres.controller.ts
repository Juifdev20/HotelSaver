import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";
import { SupabaseAuthGuard } from "../common/guards/supabase-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ChambresService } from "./chambres.service";
import { CreateChambreDto } from "./dto/create-chambre.dto";
import { UpdateChambreDto } from "./dto/update-chambre.dto";
import { FindChambresQueryDto } from "./dto/find-chambres.query.dto";
import type { UtilisateurAuthentifie } from "@hotel-chicago/types";

/**
 * Permissions (section 9.3, "Chambres (types, prix)" + "Statut chambre") :
 * lecture RECEPTIONNISTE+PATRON ; création/suppression/modif prix-type
 * réservées à PATRON ; modif statut/photos ouverte aux deux (contrôlé dans
 * le service, pas ici, car ça dépend du contenu du corps de la requête).
 */
@Controller("chambres")
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class ChambresController {
  constructor(private readonly chambresService: ChambresService) {}

  @Get()
  @Roles(Role.RECEPTIONNISTE, Role.PATRON)
  findAll(@Query() query: FindChambresQueryDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.chambresService.findAll(query, currentUser.hotelId);
  }

  @Get(":id")
  @Roles(Role.RECEPTIONNISTE, Role.PATRON)
  findOne(@Param("id") id: string, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.chambresService.findOne(id, currentUser.hotelId);
  }

  @Post()
  @Roles(Role.PATRON)
  create(@Body() dto: CreateChambreDto, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.chambresService.create(dto, currentUser.hotelId);
  }

  @Patch(":id")
  @Roles(Role.RECEPTIONNISTE, Role.PATRON)
  update(
    @Param("id") id: string,
    @Body() dto: UpdateChambreDto,
    @CurrentUser() currentUser: UtilisateurAuthentifie
  ) {
    return this.chambresService.update(id, dto, currentUser);
  }

  @Delete(":id")
  @Roles(Role.PATRON)
  remove(@Param("id") id: string, @CurrentUser() currentUser: UtilisateurAuthentifie) {
    return this.chambresService.remove(id, currentUser.hotelId);
  }
}
