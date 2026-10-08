import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import { PrismaClient } from "@hotel-chicago/database";
import { Role, type UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { SupabaseStorageService } from "../common/supabase-storage/supabase-storage.service";
import { Departement, departementDuRole } from "../common/departement";
import { DECALAGE_HEURES } from "../rapports/agregats/bornes";
import { chargerBrandingPdf } from "../rapports/pdf/branding";
import { rendreDepenses } from "../rapports/pdf/depenses";
import { CreerDepenseDto } from "./dto/creer-depense.dto";
import { ModifierDepenseDto } from "./dto/modifier-depense.dto";
import { FiltresDepensesQueryDto } from "./dto/filtres-depenses.query.dto";

const DUREE_URL_SIGNEE = 300; // 5 min : le temps d'ouvrir le PDF.
const JOUR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PERIODE_MAX_JOURS = 366;

/** « AAAA-MM-JJ » → minuit UTC (colonne @db.Date) ; null si invalide. */
function jourVersDate(jour: string): Date | null {
  if (!JOUR_PATTERN.test(jour)) return null;
  const d = new Date(`${jour}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== jour ? null : d;
}

/** Aujourd'hui à Lubumbashi, « AAAA-MM-JJ ». */
function aujourdhuiLubumbashi(maintenant = new Date()): string {
  return new Date(maintenant.getTime() + DECALAGE_HEURES * 3600_000).toISOString().slice(0, 10);
}

function jjmmaaaa(d: Date): string {
  const iso = d.toISOString().slice(0, 10);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

type LigneDepense = Awaited<ReturnType<PrismaClient["depense"]["findFirstOrThrow"]>>;

/**
 * Dépenses par département (demande du 07/10/2026). Saisie : RECEPTIONNISTE
 * et CAFETARIA seulement — jamais le patron, même si l'hôtel a activé
 * « patronPeutOperer » ; il consulte et télécharge les deux départements.
 * Le département vient TOUJOURS du rôle de l'auteur, jamais du client.
 *
 * Les créations/modifications passent aussi par la synchronisation hors
 * ligne (sync.service.ts) dont le payload n'est pas validé par le
 * ValidationPipe : toute la validation métier est donc ici, pas seulement
 * dans les DTO.
 */
@Injectable()
export class DepensesService {
  private readonly logger = new Logger(DepensesService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: SupabaseStorageService
  ) {}

  private static departementSaisie(user: UtilisateurAuthentifie): Departement {
    const departement = departementDuRole(user.role);
    if (!departement) {
      throw new ForbiddenException("Le patron consulte les dépenses mais ne les saisit pas.");
    }
    return departement;
  }

  private static validerDate(jour: unknown): Date {
    const date = typeof jour === "string" ? jourVersDate(jour) : null;
    if (!date) throw new BadRequestException("La date doit être au format AAAA-MM-JJ.");
    if ((jour as string) > aujourdhuiLubumbashi()) {
      throw new BadRequestException("Une dépense ne peut pas être datée dans le futur.");
    }
    return date;
  }

  private static validerMotif(motif: unknown): string {
    const texte = typeof motif === "string" ? motif.trim() : "";
    if (texte.length < 3 || texte.length > 200) {
      throw new BadRequestException("Le motif doit faire entre 3 et 200 caractères.");
    }
    return texte;
  }

  private static validerMontant(montant: unknown): number {
    const n = typeof montant === "string" ? Number(montant) : montant;
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
      throw new BadRequestException("Le montant doit être supérieur à zéro.");
    }
    return Math.round(n * 100) / 100;
  }

  private static validerDevise(devise: unknown): "USD" | "CDF" {
    if (devise !== "USD" && devise !== "CDF") throw new BadRequestException("La devise doit être USD ou CDF.");
    return devise;
  }

  async creer(dto: CreerDepenseDto, user: UtilisateurAuthentifie): Promise<LigneDepense> {
    const departement = DepensesService.departementSaisie(user);
    return this.prisma.depense.create({
      data: {
        hotelId: user.hotelId,
        departement,
        date: DepensesService.validerDate(dto.date),
        motif: DepensesService.validerMotif(dto.motif),
        montant: DepensesService.validerMontant(dto.montant),
        devise: DepensesService.validerDevise(dto.devise),
        creeParId: user.userId,
        creeParNom: user.nom ?? "—",
      },
    });
  }

  /** Correction ou annulation — seulement dans son propre département, et
   * jamais sur une dépense déjà annulée. */
  async modifier(id: string, dto: ModifierDepenseDto, user: UtilisateurAuthentifie): Promise<LigneDepense> {
    const departement = DepensesService.departementSaisie(user);
    const actuelle = await this.prisma.depense.findFirst({ where: { id, hotelId: user.hotelId } });
    if (!actuelle) throw new NotFoundException("Dépense introuvable.");
    if (actuelle.departement !== departement) {
      throw new ForbiddenException("Cette dépense appartient à un autre département.");
    }
    if (actuelle.annulee) throw new BadRequestException("Cette dépense est annulée : elle ne peut plus être modifiée.");

    const data: Record<string, unknown> = { syncVersion: { increment: 1 } };
    if (dto.date !== undefined) data.date = DepensesService.validerDate(dto.date);
    if (dto.motif !== undefined) data.motif = DepensesService.validerMotif(dto.motif);
    if (dto.montant !== undefined) data.montant = DepensesService.validerMontant(dto.montant);
    if (dto.devise !== undefined) data.devise = DepensesService.validerDevise(dto.devise);
    if (dto.annulee !== undefined) {
      if (dto.annulee !== true) throw new BadRequestException("Une annulation est définitive.");
      data.annulee = true;
      data.annuleeLe = new Date();
    }
    return this.prisma.depense.update({ where: { id }, data });
  }

  /** Bornes [du, au] incluses → filtre Prisma + filtre département selon le rôle. */
  private filtre(user: UtilisateurAuthentifie, filtres: FiltresDepensesQueryDto) {
    const du = jourVersDate(filtres.du);
    const au = jourVersDate(filtres.au);
    if (!du || !au) throw new BadRequestException("Les dates doivent être au format AAAA-MM-JJ.");
    if (au < du) throw new BadRequestException("La date de fin précède la date de début.");
    if ((au.getTime() - du.getTime()) / 86_400_000 > PERIODE_MAX_JOURS) {
      throw new BadRequestException("La période ne peut pas dépasser un an.");
    }
    const departement = user.role === Role.PATRON ? filtres.departement : departementDuRole(user.role) ?? undefined;
    return { du, au, departement, where: { hotelId: user.hotelId, departement, date: { gte: du, lte: au } } };
  }

  /** PATRON : les deux départements (filtre optionnel) ; personnel : le sien. */
  async lister(user: UtilisateurAuthentifie, filtres: FiltresDepensesQueryDto) {
    const { where } = this.filtre(user, filtres);
    const lignes = await this.prisma.depense.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    return lignes.map((l) => ({ ...l, date: l.date.toISOString().slice(0, 10) }));
  }

  /** Génère le PDF de la période (dépenses non annulées), le dépose dans le
   * bucket privé `rapports` et renvoie une URL signée courte. */
  async urlPdf(user: UtilisateurAuthentifie, filtres: FiltresDepensesQueryDto): Promise<{ url: string }> {
    const { du, au, departement, where } = this.filtre(user, filtres);
    const [lignes, branding] = await Promise.all([
      this.prisma.depense.findMany({
        where: { ...where, annulee: false },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      }),
      chargerBrandingPdf(this.prisma, user.hotelId, this.logger),
    ]);
    const donnees = lignes.map((l) => ({
      date: jjmmaaaa(l.date),
      motif: l.motif,
      montant: Number(l.montant),
      devise: l.devise as "USD" | "CDF",
      auteur: l.creeParNom,
      departement: l.departement as Departement,
    }));
    const empreinte = createHash("sha256").update(JSON.stringify(donnees)).digest("hex").slice(0, 16);
    const pdf = await rendreDepenses(
      donnees,
      {
        plage: `du ${jjmmaaaa(du)} au ${jjmmaaaa(au)}`,
        departement: departement ?? null,
        genereParNom: user.nom ?? "—",
        genereLe: new Date(),
      },
      branding,
      empreinte
    );
    const chemin = `${user.hotelId}/depenses/${randomUUID()}.pdf`;
    await this.storage.envoyerRapportPdf(chemin, pdf);
    return { url: await this.storage.urlSigneeRapport(chemin, DUREE_URL_SIGNEE) };
  }
}
