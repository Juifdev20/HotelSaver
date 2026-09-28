import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@hotel-chicago/database";
import { UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { SupabaseAdminService } from "../common/supabase-admin/supabase-admin.service";
import { CreateUtilisateurDto } from "./dto/create-utilisateur.dto";
import { UpdateUtilisateurDto } from "./dto/update-utilisateur.dto";

/** Champs exposés à l'écran "Utilisateurs" — jamais `supabaseAuthId`, qui
 * n'a aucun usage côté client (voir SupabaseAuthGuard, seul consommateur). */
const SELECTION = {
  id: true,
  nom: true,
  email: true,
  role: true,
  actif: true,
  createdAt: true,
} satisfies Prisma.UtilisateurSelect;

@Injectable()
export class UtilisateursService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly supabaseAdmin: SupabaseAdminService
  ) {}

  findAll(hotelId: string) {
    return this.prisma.utilisateur.findMany({
      where: { hotelId },
      select: SELECTION,
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Crée le compte Supabase Auth (confirmé d'office : posé par un patron de
   * confiance, pas une inscription libre-service — voir
   * PublicService.inscrireHotel pour le cas contraire) puis la ligne
   * Utilisateur qui porte le rôle métier. Rollback du compte Supabase si
   * l'écriture Prisma échoue (email déjà utilisé par un autre hôtel, etc.) —
   * même principe que creer-utilisateur.js et PublicService.inscrireHotel :
   * jamais de compte Supabase orphelin.
   */
  async create(dto: CreateUtilisateurDto, hotelId: string) {
    const compteAuth = await this.supabaseAdmin.creerCompte({
      email: dto.email,
      motDePasse: dto.motDePasse,
      emailConfirme: true,
    });

    try {
      return await this.prisma.utilisateur.create({
        data: { nom: dto.nom, email: dto.email, role: dto.role, actif: true, supabaseAuthId: compteAuth.id, hotelId },
        select: SELECTION,
      });
    } catch (error) {
      await this.supabaseAdmin.supprimerCompte(compteAuth.id);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(`Un compte existe déjà avec l'adresse ${dto.email}.`);
      }
      throw error;
    }
  }

  /** Active/désactive un compte, scopé au même hôtel que l'appelant — un
   * PATRON d'un autre hôtel ne doit jamais pouvoir toucher ce compte. */
  async update(id: string, dto: UpdateUtilisateurDto, currentUser: UtilisateurAuthentifie) {
    if (id === currentUser.userId) {
      throw new BadRequestException("Vous ne pouvez pas désactiver votre propre compte.");
    }
    const utilisateur = await this.prisma.utilisateur.findUnique({ where: { id } });
    if (!utilisateur || utilisateur.hotelId !== currentUser.hotelId) {
      throw new NotFoundException(`Aucun utilisateur trouvé avec l'identifiant ${id}.`);
    }
    return this.prisma.utilisateur.update({
      where: { id },
      data: { actif: dto.actif },
      select: SELECTION,
    });
  }
}
