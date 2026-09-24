import { Inject, Injectable } from "@nestjs/common";
import { PrismaClient, StatutChambre } from "@hotel-chicago/database";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";

function debutJournee(): Date {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  return debut;
}

function sommerParDevise(lignes: { montantTotalUSD: unknown; montantTotalCDF: unknown }[]) {
  return lignes.reduce(
    (acc, l) => ({
      montantUSD: acc.montantUSD + Number(l.montantTotalUSD),
      montantCDF: acc.montantCDF + Number(l.montantTotalCDF),
    }),
    { montantUSD: 0, montantCDF: 0 }
  );
}

@Injectable()
export class DashboardService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Section 9.3 "Rapports/recettes" : RECEPTIONNISTE et CAFETARIA ne voient
   * que "leurs" opérations, PATRON voit tout. On scope RECEPTIONNISTE via
   * Reservation.createdBy (Facture elle-même n'a pas de createdBy — absent
   * du schéma section 7, voir DECISIONS.md) et CAFETARIA via
   * VenteCafeteria.createdBy directement.
   *
   * Jamais de total fusionné entre USD et CDF, ni entre chambres et cafétaria
   * pour un rôle non-PATRON (section 9.4) — chaque source reste distincte.
   */
  async recetteDuJour(currentUser: UtilisateurAuthentifie) {
    const gte = debutJournee();
    const voitChambres = currentUser.role !== Role.CAFETARIA;
    const voitCafeteria = currentUser.role !== Role.RECEPTIONNISTE;

    const chambres = voitChambres
      ? sommerParDevise(
          await this.prisma.facture.findMany({
            where: {
              createdAt: { gte },
              annuleLe: null,
              reservation: currentUser.role === Role.PATRON ? undefined : { createdBy: currentUser.userId },
            },
            select: { montantTotalUSD: true, montantTotalCDF: true },
          })
        )
      : undefined;

    const cafeteria = voitCafeteria
      ? sommerParDevise(
          await this.prisma.venteCafeteria.findMany({
            where: {
              createdAt: { gte },
              annuleLe: null,
              createdBy: currentUser.role === Role.PATRON ? undefined : currentUser.userId,
            },
            select: { montantTotalUSD: true, montantTotalCDF: true },
          })
        )
      : undefined;

    const total = {
      montantUSD: (chambres?.montantUSD ?? 0) + (cafeteria?.montantUSD ?? 0),
      montantCDF: (chambres?.montantCDF ?? 0) + (cafeteria?.montantCDF ?? 0),
    };

    return { chambres, cafeteria, total };
  }

  /** RECEPTIONNISTE + PATRON uniquement (section 9.3, "Chambres"/"Statut chambre"). */
  async occupation() {
    const chambres = await this.prisma.chambre.findMany({ select: { statut: true } });
    const total = chambres.length;
    const compteParStatut = (statut: StatutChambre) => chambres.filter((c) => c.statut === statut).length;

    const occupees = compteParStatut(StatutChambre.OCCUPEE);

    return {
      total,
      libres: compteParStatut(StatutChambre.LIBRE),
      occupees,
      reservees: compteParStatut(StatutChambre.RESERVEE),
      enNettoyage: compteParStatut(StatutChambre.NETTOYAGE),
      tauxOccupationPourcent: total === 0 ? 0 : Math.round((occupees / total) * 1000) / 10,
    };
  }

  async ventesRecentes(currentUser: UtilisateurAuthentifie, limite = 20) {
    const voitChambres = currentUser.role !== Role.CAFETARIA;
    const voitCafeteria = currentUser.role !== Role.RECEPTIONNISTE;

    const factures = voitChambres
      ? await this.prisma.facture.findMany({
          where: {
            reservation: currentUser.role === Role.PATRON ? undefined : { createdBy: currentUser.userId },
          },
          include: { reservation: { include: { chambre: true, client: true } } },
          orderBy: { createdAt: "desc" },
          take: limite,
        })
      : [];

    const ventesCafeteria = voitCafeteria
      ? await this.prisma.venteCafeteria.findMany({
          where: { createdBy: currentUser.role === Role.PATRON ? undefined : currentUser.userId },
          orderBy: { createdAt: "desc" },
          take: limite,
        })
      : [];

    return { factures, ventesCafeteria };
  }

  /** CAFETARIA + PATRON uniquement (section 9.3, "Stock"). Comparaison faite en
   * JS : Prisma ne permet pas de comparer deux colonnes entre elles dans un
   * `where`, et le volume d'un menu d'hôtel ne justifie pas du SQL brut. */
  async stockBas() {
    const produits = await this.prisma.produit.findMany({
      where: { actif: true },
      orderBy: { nom: "asc" },
    });
    return produits.filter((p) => Number(p.stockActuel) <= Number(p.seuilAlerte));
  }
}
