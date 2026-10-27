import { Inject, Injectable } from "@nestjs/common";
import { PrismaClient } from "@hotel-chicago/database";
import type { UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";

/** `produitId` d'une coupure qui vaut pour TOUTES les alertes de stock. */
export const TOUS_LES_PRODUITS = "*";

export interface CoupuresAlertesStock {
  /** L'utilisateur a coupé toutes les alertes de stock. */
  toutes: boolean;
  /** Les produits dont il a coupé l'alerte. */
  produitIds: string[];
}

/**
 * Alertes de stock : chaque utilisateur peut les couper pour lui seul (un produit, ou tout). L'alerte, elle, revient toutes les 24 h tant que
 * le stock n'est pas rechargé (voir NotificationsSchedulerService.rappelsStock) — jusqu'à ce que l'utilisateur la coupe.
 */
@Injectable()
export class AlertesStockService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async lister(utilisateur: UtilisateurAuthentifie): Promise<CoupuresAlertesStock> {
    const lignes = await this.prisma.alerteStockCoupee.findMany({
      where: { utilisateurId: utilisateur.userId, hotelId: utilisateur.hotelId },
      select: { produitId: true },
    });
    return {
      toutes: lignes.some((l) => l.produitId === TOUS_LES_PRODUITS),
      produitIds: lignes.map((l) => l.produitId).filter((id) => id !== TOUS_LES_PRODUITS),
    };
  }

  /** Coupe l'alerte d'un produit (`null` = toutes). Couper deux fois est sans effet. Le produit doit appartenir à MON hôtel. */
  async couper(utilisateur: UtilisateurAuthentifie, produitId: string | null): Promise<CoupuresAlertesStock> {
    if (produitId) {
      const produit = await this.prisma.produit.findFirst({ where: { id: produitId, hotelId: utilisateur.hotelId }, select: { id: true } });
      if (!produit) return this.lister(utilisateur);
    }
    await this.prisma.alerteStockCoupee.upsert({
      where: { utilisateurId_produitId: { utilisateurId: utilisateur.userId, produitId: produitId ?? TOUS_LES_PRODUITS } },
      create: { hotelId: utilisateur.hotelId, utilisateurId: utilisateur.userId, produitId: produitId ?? TOUS_LES_PRODUITS },
      update: {},
    });
    return this.lister(utilisateur);
  }

  async reactiver(utilisateur: UtilisateurAuthentifie, produitId: string | null): Promise<CoupuresAlertesStock> {
    await this.prisma.alerteStockCoupee.deleteMany({
      where: { utilisateurId: utilisateur.userId, hotelId: utilisateur.hotelId, produitId: produitId ?? TOUS_LES_PRODUITS },
    });
    return this.lister(utilisateur);
  }

  /** Les utilisateurs de cet hôtel qui ont coupé l'alerte de ce produit (ou toutes) : ils ne reçoivent ni la voix ni la notification. */
  async utilisateursAyantCoupe(hotelId: string, produitId: string | undefined): Promise<Set<string>> {
    const lignes = await this.prisma.alerteStockCoupee.findMany({
      where: { hotelId, produitId: { in: produitId ? [produitId, TOUS_LES_PRODUITS] : [TOUS_LES_PRODUITS] } },
      select: { utilisateurId: true },
    });
    return new Set(lignes.map((l) => l.utilisateurId));
  }
}
