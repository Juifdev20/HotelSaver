import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@hotel-chicago/database";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { SupabaseAdminService } from "../common/supabase-admin/supabase-admin.service";
import {
  emailDuCompte,
  estIdentifiantInterne,
  telephoneObligatoire,
  verifierTelephoneLibre,
} from "../common/telephone/identifiant-connexion";
import { CreateUtilisateurDto } from "./dto/create-utilisateur.dto";
import { UpdateUtilisateurDto } from "./dto/update-utilisateur.dto";

/** Champs exposés à l'écran "Utilisateurs" — jamais `supabaseAuthId`, qui
 * n'a aucun usage côté client (voir SupabaseAuthGuard, seul consommateur). */
const SELECTION = {
  id: true,
  nom: true,
  email: true,
  telephone: true,
  role: true,
  actif: true,
  createdAt: true,
} satisfies Prisma.UtilisateurSelect;

/** Libellé métier d'un rôle, utilisé dans le message « un seul compte par
 * rôle » (règle validée avec le patron, Phase 16). */
/** 409 lisible pour une contrainte d'unicité Prisma (numéro ou e-mail déjà pris). */
function conflitUnicite(error: Prisma.PrismaClientKnownRequestError): ConflictException {
  const cible = String((error.meta as { target?: unknown } | undefined)?.target ?? "");
  return new ConflictException(
    cible.includes("telephone")
      ? "Ce numéro de téléphone est déjà utilisé par un autre compte."
      : "Cette adresse e-mail est déjà utilisée par un autre compte."
  );
}

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
          `(nom, numéro ou mot de passe) pour le transmettre à un nouvel employé.`
      );
    }

    // Connexion par numéro (15/10/2026) : numéro obligatoire, e-mail optionnel.
    const telephone = telephoneObligatoire(dto.telephone);
    const email = dto.email?.trim().toLowerCase() || null;
    await verifierTelephoneLibre(this.prisma, telephone);

    const compteAuth = await this.supabaseAdmin.creerCompte({ telephone, email, motDePasse: dto.motDePasse });

    try {
      return await this.prisma.utilisateur.create({
        data: { nom: dto.nom, telephone, email, role: dto.role, actif: true, supabaseAuthId: compteAuth.id, hotelId },
        select: SELECTION,
      });
    } catch (error) {
      await this.supabaseAdmin.supprimerCompte(compteAuth.id);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflitUnicite(error);
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
    if (
      dto.actif === undefined &&
      dto.nom === undefined &&
      dto.telephone === undefined &&
      dto.email === undefined &&
      dto.motDePasse === undefined
    ) {
      throw new BadRequestException("Aucun champ à modifier.");
    }
    if (id === currentUser.userId && dto.actif === false) {
      throw new BadRequestException("Vous ne pouvez pas désactiver votre propre compte.");
    }
    const utilisateur = await this.prisma.utilisateur.findUnique({ where: { id } });
    if (!utilisateur || utilisateur.hotelId !== currentUser.hotelId) {
      throw new NotFoundException(`Aucun utilisateur trouvé avec l'identifiant ${id}.`);
    }

    // Identifiants : le compte Supabase porte l'e-mail réel, sinon
    // l'identifiant interne dérivé du numéro (emailDuCompte). Un ancien compte
    // (sans numéro, e-mail parfois absent de la base) : on lit son e-mail réel
    // chez Supabase pour ne pas le perdre en lui ajoutant un numéro.
    const identifiantsChangent = dto.telephone !== undefined || dto.email !== undefined;
    let emailActuel = utilisateur.email;
    if (identifiantsChangent && !emailActuel && !utilisateur.telephone) {
      const lu = await this.supabaseAdmin.lireEmailCompte(utilisateur.supabaseAuthId);
      emailActuel = lu && !estIdentifiantInterne(lu) ? lu : null;
    }
    const telephone = dto.telephone !== undefined ? telephoneObligatoire(dto.telephone) : utilisateur.telephone;
    const email = dto.email !== undefined ? dto.email.trim().toLowerCase() || null : emailActuel;
    if (identifiantsChangent) {
      if (!telephone && !email) throw new BadRequestException("Le compte doit garder un numéro de téléphone.");
      if (telephone && telephone !== utilisateur.telephone) await verifierTelephoneLibre(this.prisma, telephone, id);
    }

    if (identifiantsChangent || dto.motDePasse !== undefined) {
      await this.supabaseAdmin.mettreAJourCompte(utilisateur.supabaseAuthId, {
        email: identifiantsChangent ? emailDuCompte(telephone, email) : undefined,
        motDePasse: dto.motDePasse,
      });
    }

    try {
      return await this.prisma.utilisateur.update({
        where: { id },
        data: {
          ...(dto.nom !== undefined && { nom: dto.nom }),
          ...(identifiantsChangent && { telephone, email }),
          ...(dto.actif !== undefined && { actif: dto.actif }),
        },
        select: SELECTION,
      });
    } catch (error) {
      // Remettre l'ancien identifiant Supabase (le mot de passe, lui, n'est pas réversible).
      if (identifiantsChangent && (utilisateur.telephone || emailActuel)) {
        await this.supabaseAdmin
          .mettreAJourCompte(utilisateur.supabaseAuthId, { email: emailDuCompte(utilisateur.telephone, emailActuel) })
          .catch(() => {});
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflitUnicite(error);
      throw error;
    }
  }
}
