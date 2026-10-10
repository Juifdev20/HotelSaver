import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@hotel-chicago/database";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { SupabaseAdminService } from "../common/supabase-admin/supabase-admin.service";
import { CreateUtilisateurDto } from "./dto/create-utilisateur.dto";
import { UpdateUtilisateurDto } from "./dto/update-utilisateur.dto";
import { revoquerSessions } from "../common/auth/sessions";

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

/** Libellé métier d'un rôle, utilisé dans le message « un seul compte par
 * rôle » (règle validée avec le patron, Phase 16). */
const LIBELLE_ROLE: Record<Role, string> = {
  [Role.PATRON]: "Patron",
  [Role.RECEPTIONNISTE]: "Réception",
  [Role.CAFETARIA]: "Cafétaria",
};

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
   *
   * Un hôtel n'a qu'UN compte par rôle (règle validée avec le patron,
   * Phase 16 : un compte de rôle partagé, dont on fait tourner les
   * identifiants via update quand l'employé change). Le contrôle est posé
   * AVANT l'appel Supabase pour ne pas créer de compte orphelin, compté
   * sans filtre `actif` — un compte désactivé se réactive/modifie, il ne
   * se remplace pas.
   */
  async create(dto: CreateUtilisateurDto, hotelId: string) {
    const existant = await this.prisma.utilisateur.count({ where: { hotelId, role: dto.role } });
    if (existant > 0) {
      throw new ConflictException(
        `Cet hôtel a déjà un compte ${LIBELLE_ROLE[dto.role]}. ` +
          `Un seul compte par rôle est autorisé — modifiez le compte existant ` +
          `(nom, email ou mot de passe) pour le transmettre à un nouvel employé.`
      );
    }

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

  /** Met à jour un compte, scopé au même hôtel que l'appelant — un PATRON
   * d'un autre hôtel ne doit jamais pouvoir toucher ce compte. Email et mot
   * de passe passent par Supabase Auth AVANT l'écriture Prisma (la source
   * d'authentification fait foi) ; si l'écriture Prisma échoue ensuite
   * (email déjà pris par un autre compte), on tente de remettre l'ancien
   * email — le mot de passe, lui, n'est pas réversible. */
  async update(id: string, dto: UpdateUtilisateurDto, currentUser: UtilisateurAuthentifie) {
    if (dto.actif === undefined && dto.nom === undefined && dto.email === undefined && dto.motDePasse === undefined) {
      throw new BadRequestException("Aucun champ à modifier.");
    }
    if (id === currentUser.userId && dto.actif === false) {
      throw new BadRequestException("Vous ne pouvez pas désactiver votre propre compte.");
    }
    const utilisateur = await this.prisma.utilisateur.findUnique({ where: { id } });
    if (!utilisateur || utilisateur.hotelId !== currentUser.hotelId) {
      throw new NotFoundException(`Aucun utilisateur trouvé avec l'identifiant ${id}.`);
    }

    if (dto.email !== undefined || dto.motDePasse !== undefined) {
      await this.supabaseAdmin.mettreAJourCompte(utilisateur.supabaseAuthId, {
        email: dto.email,
        motDePasse: dto.motDePasse,
      });
    }

    try {
      const misAJour = await this.prisma.utilisateur.update({
        where: { id },
        data: {
          ...(dto.nom !== undefined && { nom: dto.nom }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.actif !== undefined && { actif: dto.actif }),
        },
        select: SELECTION,
      });
      // Départ d'un employé, mot de passe ou e-mail changé : ses sessions ouvertes (et leur jeton de rafraîchissement) cessent de fonctionner.
      // Jamais celles de la personne qui fait la modification elle-même (changer son propre mot de passe ne la déconnecte pas).
      if (id !== currentUser.userId && (dto.actif === false || dto.motDePasse !== undefined || dto.email !== undefined)) {
        await revoquerSessions(this.prisma, id);
      }
      return misAJour;
    } catch (error) {
      if (dto.email !== undefined && utilisateur.email) {
        await this.supabaseAdmin.mettreAJourCompte(utilisateur.supabaseAuthId, { email: utilisateur.email }).catch(() => {});
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(`Un compte existe déjà avec l'adresse ${dto.email}.`);
      }
      throw error;
    }
  }
}
