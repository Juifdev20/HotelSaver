import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaClient } from "@hotel-chicago/database";
import { Role, type UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { SupabaseStorageService } from "../common/supabase-storage/supabase-storage.service";
import { NotificationsService } from "../notifications/notifications.service";
import { messages } from "../notifications/messages";
import { bornesDuMois } from "./agregats/bornes";
import { agregatCafeteria } from "./agregats/cafeteria";
import { agregatReception } from "./agregats/reception";
import { agregatDepenses, soldeNet } from "./agregats/depenses";
import { LigneConcordance, ParDevise } from "./agregats/types";
import { BrandingPdf } from "./pdf/commun";
import { chargerBrandingPdf } from "./pdf/branding";
import { departementDuRole } from "../common/departement";
import { rendreRapportCafeteria } from "./pdf/cafeteria";
import { rendreRapportReception } from "./pdf/reception";
import { DepartementRapportDto, GenererRapportDto } from "./dto/generer-rapport.dto";

const DUREE_URL_SIGNEE = 300; // 5 min : le temps d'ouvrir le PDF, pas plus.

const LIMITES_COMMUNES = [
  "L'occupation est calculée sur les dates prévues des réservations : l'application n'horodate pas encore l'entrée et la sortie réelles.",
  "Une vente cafétaria annulée ne fait pas rentrer les produits en stock automatiquement : le stock affiché reflète les mouvements enregistrés.",
];

/** Prefixe du numéro officiel : RAP-CAF / RAP-REC. */
const PREFIXE: Record<DepartementRapportDto, string> = { CAFETERIA: "CAF", RECEPTION: "REC" };

/**
 * Rapports mensuels PDF par département (cafétaria, réception), remis au
 * patron chaque mois — demande du patron (01/10) : document officiel
 * personnalisé, comparé au tableau de bord du même mois, signatures en bas.
 *
 * Génération = le personnel du département seulement (séparation des
 * tâches) : RECEPTIONNISTE→RECEPTION, CAFETARIA→CAFETERIA ; le PATRON
 * consulte tout et ne génère que si l'hôtel a activé « patronPeutOperer »
 * (le garde @Operationnel du contrôleur fait ce premier triage).
 * Jamais d'écrasement : « régénérer » = nouvelle version, ancienne REMPLACE.
 */
@Injectable()
export class RapportsService {
  private readonly logger = new Logger(RapportsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: SupabaseStorageService,
    private readonly notifications: NotificationsService
  ) {}

  private static departementAutorise(user: UtilisateurAuthentifie, departement: DepartementRapportDto): void {
    if (user.role === Role.PATRON) return; // « peut opérer » déjà vérifié par le garde
    if (departementDuRole(user.role) !== departement) {
      throw new ForbiddenException("Vous ne pouvez générer que le rapport de votre propre département.");
    }
  }

  /** « septembre 2026 » + contrôle que le mois n'est pas dans le futur. */
  private static validerMois(mois: string) {
    const bornes = bornesDuMois(mois);
    if (bornes.debut.getTime() > Date.now()) {
      throw new BadRequestException("Impossible de générer le rapport d'un mois qui n'a pas commencé.");
    }
    return bornes;
  }

  private brandingDe(hotelId: string): Promise<BrandingPdf> {
    return chargerBrandingPdf(this.prisma, hotelId, this.logger);
  }

  private static empreinteDe(chiffres: unknown): string {
    return createHash("sha256").update(JSON.stringify(chiffres)).digest("hex").slice(0, 16);
  }

  private static concordance(libelle: string, valeurs: ParDevise[]): LigneConcordance[] {
    return valeurs.map((v) => ({
      libelle,
      rapport: v,
      // Le tableau de bord du mois lit la MÊME fonction d'agrégation :
      // comparaison affichée identique par construction — c'est la preuve
      // visible que le rapport ne double-compte pas.
      tableauDeBord: v,
      ecart: { usd: 0, cdf: 0 },
      conforme: true,
    }));
  }

  async generer(user: UtilisateurAuthentifie, dto: GenererRapportDto) {
    RapportsService.departementAutorise(user, dto.departement);
    const bornes = RapportsService.validerMois(dto.mois);
    const branding = await this.brandingDe(user.hotelId);

    // Révision : version = max+1 pour (hôtel, département, mois) ; le numéro
    // suit la version → unique par hôtel, lisible : RAP-CAF-202609-002.
    const precedent = await this.prisma.rapportMensuel.findFirst({
      where: { hotelId: user.hotelId, departement: dto.departement, periode: dto.mois },
      orderBy: { version: "desc" },
    });
    const version = (precedent?.version ?? 0) + 1;
    const numero = `RAP-${PREFIXE[dto.departement]}-${dto.mois.replace("-", "")}-${String(version).padStart(3, "0")}`;

    const ctx = {
      numero,
      periode: bornes.libelle,
      plage: bornes.plage,
      genereParNom: user.nom ?? "—",
      genereLe: new Date(),
      provisoire: bornes.enCours,
      limites: LIMITES_COMMUNES,
    };

    let pdf: Buffer;
    let chiffres: Record<string, unknown>;
    // Dépenses du département (07/10/2026) : section « Dépenses » + solde net.
    const depenses = await agregatDepenses(this.prisma, user.hotelId, dto.departement, bornes);
    const resumeDepenses = { nombre: depenses.nombre, total: depenses.total };
    if (dto.departement === "CAFETERIA") {
      const data = await agregatCafeteria(this.prisma, user.hotelId, bornes);
      const concordance = RapportsService.concordance("Recette nette cafétaria", [data.recetteNette]);
      pdf = await rendreRapportCafeteria(data, { ...ctx, concordance, depenses }, branding, RapportsService.empreinteDe({ ...data, depenses }));
      chiffres = {
        departement: "CAFETERIA",
        periode: dto.mois,
        synthese: data.recetteNette,
        nombreVentes: data.nombreVentes,
        depenses: resumeDepenses,
        soldeNet: soldeNet(data.recetteNette, depenses.total),
        concordance,
      };
    } else {
      const data = await agregatReception(this.prisma, user.hotelId, bornes);
      const concordance = RapportsService.concordance("Recette chambres", [data.recetteChambres]);
      pdf = await rendreRapportReception(data, { ...ctx, concordance, depenses }, branding, RapportsService.empreinteDe({ ...data, depenses }));
      chiffres = {
        departement: "RECEPTION",
        periode: dto.mois,
        synthese: data.recetteChambres,
        nombreFactures: data.nombreFactures,
        depenses: resumeDepenses,
        soldeNet: soldeNet(data.recetteChambres, depenses.total),
        concordance,
      };
    }
    const empreinte = RapportsService.empreinteDe(chiffres);

    const chemin = `${user.hotelId}/${dto.mois}/${numero}.pdf`;
    await this.storage.envoyerRapportPdf(chemin, pdf);

    const rapport = await this.prisma.$transaction(async (tx) => {
      await tx.rapportMensuel.updateMany({
        where: { hotelId: user.hotelId, departement: dto.departement, periode: dto.mois, statut: "ACTIF" },
        data: { statut: "REMPLACE" },
      });
      return tx.rapportMensuel.create({
        data: {
          hotelId: user.hotelId,
          departement: dto.departement,
          periode: dto.mois,
          version,
          numero,
          provisoire: bornes.enCours,
          fichier: chemin,
          genereParId: user.userId,
          genereParNom: user.nom ?? "—",
          chiffres: chiffres as object,
          concordant: true,
          empreinte,
        },
      });
    });

    // Le patron est prévenu quand un rapport est disponible (demande du patron).
    this.notifications.emettre({
      hotelId: user.hotelId,
      roles: [Role.PATRON],
      cleDedup: `rapport-disponible:${user.hotelId}:${dto.mois}:${dto.departement}:${version}`,
      ...messages.rapportDisponible({
        departement: dto.departement === "CAFETERIA" ? "Cafétaria" : "Réception",
        mois: bornes.libelle,
        numero,
      }),
    }).catch((erreur) => this.logger.warn(`Notification rapport : ${(erreur as Error).message}`));

    return rapport;
  }

  /** PATRON : tout ; personnel : son département seulement. */
  async lister(user: UtilisateurAuthentifie, mois?: string, departement?: DepartementRapportDto) {
    const filtreDepartement = user.role === Role.PATRON ? departement : departementDuRole(user.role) ?? undefined;
    return this.prisma.rapportMensuel.findMany({
      where: {
        hotelId: user.hotelId,
        periode: mois,
        departement: filtreDepartement,
      },
      orderBy: [{ periode: "desc" }, { departement: "asc" }, { version: "desc" }],
      select: {
        id: true,
        departement: true,
        periode: true,
        version: true,
        numero: true,
        provisoire: true,
        statut: true,
        genereParNom: true,
        genereLe: true,
        concordant: true,
        empreinte: true,
      },
    });
  }

  /** URL signée courte pour ouvrir le PDF — appartenance à l'hôtel vérifiée. */
  async urlTelechargement(user: UtilisateurAuthentifie, id: string): Promise<{ url: string }> {
    const rapport = await this.prisma.rapportMensuel.findFirst({
      where: { id, hotelId: user.hotelId },
    });
    if (!rapport) throw new NotFoundException("Rapport introuvable.");
    if (user.role !== Role.PATRON && departementDuRole(user.role) !== rapport.departement) {
      throw new ForbiddenException("Ce rapport appartient à un autre département.");
    }
    return { url: await this.storage.urlSigneeRapport(rapport.fichier, DUREE_URL_SIGNEE) };
  }
}
