import { BadRequestException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { PrismaClient } from "@hotel-chicago/database";
import { fonctionsAutorisees } from "@hotel-chicago/regles";
import type { ReglagesPaiementEnLigne } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { lireCatalogue } from "../common/abonnement/catalogue";
import { ErreurLinkPay, LinkPayClient } from "../abonnement/linkpay.client";
import type { ModifierReglagesPaiementDto } from "./dto/reglages-paiement.dto";

export const urlScanLinkPay = (): string | null => {
  const u = (process.env.LINKPAY_SITE_URL ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\//i.test(u) ? u : null;
};

/** Le compte ScanLinkPay de l'hôtel et la règle d'acompte, que SEUL le patron modifie. */
@Injectable()
export class ReglagesPaiementService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly linkpay: LinkPayClient
  ) {}

  private async fonctionIncluse(hotel: { id: string; formule: string | null }): Promise<boolean> {
    const catalogue = await lireCatalogue(this.prisma);
    const aPaye = (await this.prisma.paiementLicence.count({ where: { hotelId: hotel.id } })) > 0;
    return fonctionsAutorisees(hotel, aPaye, catalogue.formules, catalogue.parametres).includes("ACOMPTE_EN_LIGNE");
  }

  async lire(hotelId: string): Promise<ReglagesPaiementEnLigne> {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    return {
      fonctionIncluse: await this.fonctionIncluse(hotel),
      serveurRelie: this.linkpay.adresseConfiguree(),
      numeroScanLinkPay: hotel.numeroScanLinkPay,
      boutiqueScanLinkPayId: hotel.boutiqueScanLinkPayId,
      nomScanLinkPay: hotel.nomScanLinkPay,
      pourcentageAcompte: hotel.pourcentageAcompte,
      fraisPayesParClient: hotel.acompteFraisPayesParClient,
      conditionsAnnulation: hotel.conditionsAnnulation,
      urlScanLinkPay: urlScanLinkPay(),
    };
  }

  async modifier(hotelId: string, dto: ModifierReglagesPaiementDto): Promise<ReglagesPaiementEnLigne> {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    if (!(await this.fonctionIncluse(hotel))) {
      throw new ForbiddenException("Le paiement en ligne n'est pas inclus dans la formule de votre hôtel. Passez à une formule supérieure dans Paramètres → Abonnement.");
    }
    const numero = dto.numeroScanLinkPay === undefined ? hotel.numeroScanLinkPay : dto.numeroScanLinkPay === null ? null : dto.numeroScanLinkPay.trim();
    const boutique = dto.boutiqueScanLinkPayId === undefined ? hotel.boutiqueScanLinkPayId : dto.boutiqueScanLinkPayId?.trim() || null;
    const pourcentage = dto.pourcentageAcompte ?? hotel.pourcentageAcompte;

    if (pourcentage > 0 && !numero) {
      throw new BadRequestException("Pour demander un acompte en ligne, renseignez d'abord le numéro ScanLinkPay de votre hôtel : c'est là que l'argent arrivera.");
    }

    // Vérifie le numéro auprès de ScanLinkPay et garde le nom de l'entreprise : le patron voit tout de suite si c'est bien la sienne.
    let nom = hotel.nomScanLinkPay;
    if (numero && (numero !== hotel.numeroScanLinkPay || boutique !== hotel.boutiqueScanLinkPayId || !nom)) {
      if (!this.linkpay.adresseConfiguree()) {
        throw new ServiceUnavailableException("Le serveur n'est pas encore relié à ScanLinkPay : contactez le support HotelSaver.");
      }
      try {
        const apercu = await this.linkpay.apercuFrais({ marchand: { numero, boutiqueId: boutique }, montantCentimes: 10_000, devise: "USD", modele: "MERCHANT_PAID" });
        nom = apercu.entreprise;
      } catch (e) {
        if (e instanceof ErreurLinkPay && e.affichable) throw new BadRequestException(e.message);
        if (e instanceof ErreurLinkPay && e.statut === 404) throw new BadRequestException("Numéro ScanLinkPay introuvable. Vérifiez-le dans l'application ScanLinkPay (Profil entreprise).");
        throw new ServiceUnavailableException("ScanLinkPay ne répond pas pour le moment. Réessayez dans un instant.");
      }
    }
    if (!numero) nom = null;

    await this.prisma.hotel.update({
      where: { id: hotelId },
      data: {
        numeroScanLinkPay: numero,
        boutiqueScanLinkPayId: numero ? boutique : null,
        nomScanLinkPay: nom,
        pourcentageAcompte: numero ? pourcentage : 0,
        ...(dto.fraisPayesParClient !== undefined && { acompteFraisPayesParClient: dto.fraisPayesParClient }),
        ...(dto.conditionsAnnulation !== undefined && { conditionsAnnulation: dto.conditionsAnnulation?.trim() || null }),
      },
    });
    return this.lire(hotelId);
  }
}
