import { Inject, Injectable } from "@nestjs/common";
import { PrismaClient, StatutChambre } from "@hotel-chicago/database";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { bornesDuMois } from "../rapports/agregats/bornes";
import { agregatCafeteria } from "../rapports/agregats/cafeteria";
import { agregatReception } from "../rapports/agregats/reception";

/** Lubumbashi = UTC+2 toute l'année. La « journée » du tableau de bord est la
 * journée LOCALE de l'hôtel, pas celle du serveur — sinon un déploiement UTC
 * décale les totaux de deux heures (fix du 01/10 : recette-du-jour et
 * recette-du-mois doivent parler du même fuseau que les rapports). */
const DECALAGE_LUBUMBASHI_MS = 2 * 3600_000;

function debutJournee(): Date {
  const maintenant = new Date();
  const local = new Date(maintenant.getTime() + DECALAGE_LUBUMBASHI_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - DECALAGE_LUBUMBASHI_MS);
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
              hotelId: currentUser.hotelId,
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
              hotelId: currentUser.hotelId,
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

  /**
   * Recette du MOIS « AAAA-MM » (à Lubumbashi) — les mêmes fonctions
   * d'agrégation que les rapports mensuels PDF (agregatCafeteria /
   * agregatReception) : la concordance affichée dans le rapport est une
   * comparaison réelle, pas deux calculs parallèles. Filtrage par rôle
   * identique à recetteDuJour.
   */
  async recetteDuMois(currentUser: UtilisateurAuthentifie, mois: string) {
    const bornes = bornesDuMois(mois);
    const voitChambres = currentUser.role !== Role.CAFETARIA;
    const voitCafeteria = currentUser.role !== Role.RECEPTIONNISTE;

    const cafeteria = voitCafeteria ? await agregatCafeteria(this.prisma, currentUser.hotelId, bornes) : undefined;
    const reception = voitChambres ? await agregatReception(this.prisma, currentUser.hotelId, bornes) : undefined;

    const chambres = reception && {
      montantUSD: reception.recetteChambres.usd,
      montantCDF: reception.recetteChambres.cdf,
    };
    const ventesCafeteria = cafeteria && {
      montantUSD: cafeteria.recetteNette.usd,
      montantCDF: cafeteria.recetteNette.cdf,
    };
    const total = {
      montantUSD: (chambres?.montantUSD ?? 0) + (ventesCafeteria?.montantUSD ?? 0),
      montantCDF: (chambres?.montantCDF ?? 0) + (ventesCafeteria?.montantCDF ?? 0),
    };

    return {
      periode: bornes.libelle,
      enCours: bornes.enCours,
      chambres: reception
        ? { ...chambres, nombreFactures: reception.nombreFactures, nuitees: reception.nuitees, tauxOccupationPourcent: reception.tauxOccupationPourcent }
        : undefined,
      cafeteria: cafeteria
        ? { ...ventesCafeteria, nombreVentes: cafeteria.nombreVentes, panierMoyenUSD: cafeteria.panierMoyen.usd, panierMoyenCDF: cafeteria.panierMoyen.cdf }
        : undefined,
      total,
    };
  }

  /** RECEPTIONNISTE + PATRON uniquement (section 9.3, "Chambres"/"Statut chambre"). */
  async occupation(hotelId: string) {
    const chambres = await this.prisma.chambre.findMany({ where: { hotelId }, select: { statut: true } });
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
            hotelId: currentUser.hotelId,
            reservation: currentUser.role === Role.PATRON ? undefined : { createdBy: currentUser.userId },
          },
          include: { reservation: { include: { chambre: true, client: true } } },
          orderBy: { createdAt: "desc" },
          take: limite,
        })
      : [];

    const ventesCafeteria = voitCafeteria
      ? await this.prisma.venteCafeteria.findMany({
          where: {
            hotelId: currentUser.hotelId,
            createdBy: currentUser.role === Role.PATRON ? undefined : currentUser.userId,
          },
          orderBy: { createdAt: "desc" },
          take: limite,
        })
      : [];

    return { factures, ventesCafeteria };
  }

  /** CAFETARIA + PATRON uniquement (section 9.3, "Stock"). Comparaison faite en
   * JS : Prisma ne permet pas de comparer deux colonnes entre elles dans un
   * `where`, et le volume d'un menu d'hôtel ne justifie pas du SQL brut. */
  async stockBas(hotelId: string) {
    const produits = await this.prisma.produit.findMany({
      where: { hotelId, actif: true },
      orderBy: { nom: "asc" },
    });
    return produits.filter((p) => Number(p.stockActuel) <= Number(p.seuilAlerte));
  }
}
