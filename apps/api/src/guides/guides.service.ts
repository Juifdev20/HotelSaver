import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Prisma, PrismaClient } from "@hotel-chicago/database";
import { GUIDES_PAR_ROLE, LIBELLE_GUIDE, Role, type GuideDisponible, type TypeGuide } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { SupabaseStorageService } from "../common/supabase-storage/supabase-storage.service";

/** Durée de validité d'un lien de guide : partager le lien ne sert à rien au-delà. */
export const DUREE_LIEN_GUIDE = 300;
export const TYPES_GUIDE: TypeGuide[] = ["COMPLET", "PATRON", "RECEPTION", "CAFETERIA"];

const NOM_FICHIER: Record<TypeGuide, string> = {
  COMPLET: "Guide-HotelSaver-complet.pdf",
  PATRON: "Guide-HotelSaver-patron.pdf",
  RECEPTION: "Guide-HotelSaver-reception.pdf",
  CAFETERIA: "Guide-HotelSaver-cafetaria.pdf",
};

/** Chemin d'un guide déposé : `<guide>/<uuid>.pdf`, toujours créé par le serveur (jamais choisi par le client). */
const CHEMIN_VALIDE = /^(COMPLET|PATRON|RECEPTION|CAFETERIA)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

/**
 * Guides d'utilisation PDF (20/10/2026). Publiés par le super-admin (fichier déposé directement dans le bucket PRIVÉ
 * « guides », puis enregistré ici) ; lus par les comptes connectés selon leur rôle (GUIDES_PAR_ROLE), par URL signée courte.
 */
@Injectable()
export class GuidesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: SupabaseStorageService
  ) {}

  /** Dernière version de chaque guide permis à ce rôle (un guide jamais publié n'apparaît pas). */
  async listerPourRole(role: Role): Promise<GuideDisponible[]> {
    const permis = GUIDES_PAR_ROLE[role] ?? [];
    const versions = await this.prisma.guideUtilisation.findMany({ where: { guide: { in: permis } }, orderBy: { version: "desc" } });
    const resultat: GuideDisponible[] = [];
    for (const guide of permis) {
      const v = versions.find((x) => x.guide === guide); // la plus récente : tri par version décroissante
      if (!v) continue;
      resultat.push({ guide, libelle: LIBELLE_GUIDE[guide], version: v.version, edition: v.edition, taille: v.taille, publieLe: v.publieLe.toISOString() });
    }
    return resultat;
  }

  /** Lien de 5 minutes vers la dernière version d'un guide, si le rôle y a droit. */
  async lienPourRole(role: Role, guide: string): Promise<{ url: string; expireDans: number }> {
    if (!TYPES_GUIDE.includes(guide as TypeGuide)) throw new NotFoundException("Guide introuvable.");
    if (!(GUIDES_PAR_ROLE[role] ?? []).includes(guide as TypeGuide)) throw new ForbiddenException("Ce guide n'est pas disponible pour votre compte.");
    const derniere = await this.prisma.guideUtilisation.findFirst({ where: { guide: guide as TypeGuide }, orderBy: { version: "desc" } });
    if (!derniere) throw new NotFoundException("Ce guide n'est pas encore publié.");
    return { url: await this.storage.urlSigneeGuide(derniere.fichier, DUREE_LIEN_GUIDE, NOM_FICHIER[derniere.guide]), expireDans: DUREE_LIEN_GUIDE };
  }

  /* ---------------------------------------------------------------- super-admin */

  listerVersions() {
    return this.prisma.guideUtilisation.findMany({ orderBy: [{ guide: "asc" }, { version: "desc" }] });
  }

  /** Prépare le dépôt d'un nouveau PDF : chemin choisi par le serveur + adresse d'envoi à usage unique. */
  async preparerEnvoi(guide: TypeGuide): Promise<{ chemin: string; urlEnvoi: string }> {
    const chemin = `${guide}/${randomUUID()}.pdf`;
    return { chemin, urlEnvoi: await this.storage.urlEnvoiGuide(chemin) };
  }

  /** Enregistre une nouvelle version après vérification que le fichier a bien été déposé au chemin préparé. */
  async publier(guide: TypeGuide, chemin: string, edition: string | undefined, superAdminId: string) {
    if (!CHEMIN_VALIDE.test(chemin) || !chemin.startsWith(`${guide}/`)) throw new BadRequestException("Fichier invalide pour ce guide.");
    const taille = await this.storage.tailleGuide(chemin);
    if (!taille) throw new BadRequestException("Le fichier n'a pas été reçu : recommencez l'envoi.");
    const derniere = await this.prisma.guideUtilisation.findFirst({ where: { guide }, orderBy: { version: "desc" }, select: { version: true } });
    try {
      return await this.prisma.guideUtilisation.create({
        data: { guide, version: (derniere?.version ?? 0) + 1, fichier: chemin, taille, edition: edition?.trim() || null, publiePar: superAdminId },
      });
    } catch (e) {
      // Deux publications du même guide au même instant : la seconde est refusée.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("Une autre version vient d'être publiée : rechargez la page.");
      }
      throw e;
    }
  }

  /** Lien de contrôle pour le super-admin (n'importe quelle version). */
  async lienVersion(id: string): Promise<{ url: string; expireDans: number }> {
    const v = await this.prisma.guideUtilisation.findUnique({ where: { id } });
    if (!v) throw new NotFoundException("Version introuvable.");
    return { url: await this.storage.urlSigneeGuide(v.fichier, DUREE_LIEN_GUIDE, NOM_FICHIER[v.guide]), expireDans: DUREE_LIEN_GUIDE };
  }
}
