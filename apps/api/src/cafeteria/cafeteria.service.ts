import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Devise, Prisma, PrismaClient } from "@hotel-chicago/database";
import { PRISMA } from "../prisma/prisma.module";
import { StockService } from "../stock/stock.service";
import { calculerEncaissement } from "../factures/encaissement.util";
import { repartirEnParts } from "./partage.util";
import { OuvrirCompteDto } from "./dto/ouvrir-compte.dto";
import { AjouterSousCompteDto } from "./dto/ajouter-sous-compte.dto";
import { AjouterLigneDto } from "./dto/ajouter-ligne.dto";
import { EncaisserCompteDto } from "./dto/encaisser-compte.dto";
import { FindComptesQueryDto } from "./dto/find-comptes.query.dto";

const INCLUDE_COMPTE_COMPLET = {
  sousComptes: { include: { lignes: { include: { produit: true } } } },
  ventes: true,
} satisfies Prisma.CompteCafeteriaInclude;

type CompteComplet = Prisma.CompteCafeteriaGetPayload<{ include: typeof INCLUDE_COMPTE_COMPLET }>;
type LigneAvecProduit = CompteComplet["sousComptes"][number]["lignes"][number];

@Injectable()
export class CafeteriaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly stockService: StockService
  ) {}

  findAllComptes(query: FindComptesQueryDto) {
    return this.prisma.compteCafeteria.findMany({
      where: { statut: query.statut },
      include: INCLUDE_COMPTE_COMPLET,
      orderBy: { ouvertLe: "desc" },
    });
  }

  async findOneCompte(id: string): Promise<CompteComplet> {
    const compte = await this.prisma.compteCafeteria.findUnique({
      where: { id },
      include: INCLUDE_COMPTE_COMPLET,
    });
    if (!compte) {
      throw new NotFoundException(`Aucun compte cafétaria trouvé avec l'identifiant ${id}.`);
    }
    return compte;
  }

  ouvrirCompte(dto: OuvrirCompteDto, currentUser: { userId: string }) {
    return this.prisma.compteCafeteria.create({
      data: {
        tableOuNom: dto.tableOuNom,
        ouvertPar: currentUser.userId,
        sousComptes: { create: [{ nom: dto.nomPremierSousCompte ?? "Personne 1" }] },
      },
      include: { sousComptes: true },
    });
  }

  async ajouterSousCompte(compteId: string, dto: AjouterSousCompteDto) {
    const compte = await this.findOneCompte(compteId);
    this.verifierCompteOuvert(compte);
    return this.prisma.sousCompte.create({ data: { compteId, nom: dto.nom } });
  }

  async ajouterLigne(compteId: string, dto: AjouterLigneDto, currentUser: { userId: string }) {
    // Deux lectures indépendantes (aucune n'a besoin du résultat de l'autre) :
    // en parallèle plutôt que l'une après l'autre — chaque aller-retour
    // compte sur une connexion internet lente (voir DECISIONS.md, Phase 6).
    const [compte, produit] = await Promise.all([
      this.findOneCompte(compteId),
      this.prisma.produit.findUnique({ where: { id: dto.produitId } }),
    ]);
    this.verifierCompteOuvert(compte);

    const sousCompte = compte.sousComptes.find((sc) => sc.id === dto.sousCompteId);
    if (!sousCompte) {
      throw new NotFoundException(`Le sous-compte ${dto.sousCompteId} n'appartient pas au compte ${compteId}.`);
    }

    if (!produit) {
      throw new NotFoundException(`Aucun produit trouvé avec l'identifiant ${dto.produitId}.`);
    }
    if (!produit.actif) {
      throw new ConflictException(`Le produit "${produit.nom}" n'est plus disponible à la vente.`);
    }

    // Pas de `$transaction(async tx => ...)` ici (retiré le 26/09/2026) : le
    // pooler Supabase est coincé en mode "transaction" depuis la panne du
    // mode "session" du 25/09/2026 (voir DECISIONS.md), incompatible avec les
    // transactions interactives Prisma. Le stock est vérifié/décrémenté AVANT
    // toute création (ordre important) : si le stock est insuffisant, on lève
    // avant de créer quoi que ce soit — jamais de ligne de commande orpheline
    // sans mouvement de stock correspondant. `produit` est réutilisé (déjà
    // chargé ci-dessus pour vérifier `actif`) pour épargner une deuxième
    // lecture — chaque aller-retour compte sur une connexion internet lente
    // (service jugé trop lent en conditions réelles, 26/09/2026).
    await this.stockService.decrementerStock(
      this.prisma,
      { produitId: dto.produitId, type: "SORTIE_VENTE", quantite: dto.quantite },
      produit
    );

    // Une fois le stock validé, le mouvement d'audit et la ligne de commande
    // sont deux écritures indépendantes (aucune n'a besoin du résultat de
    // l'autre) : envoyées en parallèle plutôt que l'une après l'autre.
    const [, ligne] = await Promise.all([
      this.prisma.mouvementStock.create({
        data: {
          produitId: dto.produitId,
          quantite: dto.quantite,
          type: "SORTIE_VENTE",
          motif: `Vente cafétaria — compte "${compte.tableOuNom}"`,
          createdBy: currentUser.userId,
        },
      }),
      this.prisma.ligneCommande.create({
        data: {
          sousCompteId: dto.sousCompteId,
          produitId: dto.produitId,
          quantite: dto.quantite,
          prixUnitaire: produit.prix,
          devise: produit.devise,
        },
        include: { produit: true },
      }),
    ]);

    return ligne;
  }

  async encaisser(compteId: string, dto: EncaisserCompteDto, currentUser: { userId: string }) {
    const compte = await this.findOneCompte(compteId);
    this.verifierCompteOuvert(compte);

    const toutesLesLignes = compte.sousComptes.flatMap((sc) => sc.lignes);
    if (toutesLesLignes.length === 0) {
      throw new BadRequestException("Impossible d'encaisser un compte sans aucune ligne de commande.");
    }

    if (dto.modePaiement === "FACTURE_CHAMBRE" && !dto.reservationLieeId) {
      throw new BadRequestException("reservationLieeId est obligatoire pour un règlement FACTURE_CHAMBRE.");
    }
    if (dto.reservationLieeId) {
      const reservation = await this.prisma.reservation.findUnique({ where: { id: dto.reservationLieeId } });
      if (!reservation) {
        throw new NotFoundException(`Aucune réservation trouvée avec l'identifiant ${dto.reservationLieeId}.`);
      }
    }

    const paiementCroiseDemande = dto.deviseRegleeParClient !== undefined || dto.montantRegleParClient !== undefined;
    if (paiementCroiseDemande && dto.mode !== "GROUPE") {
      throw new BadRequestException(
        "Le paiement croisé n'est calculé que pour le mode d'encaissement GROUPE dans cette version. " +
          "Encaissez chaque vente séparément pour PAR_SOUS_COMPTE ou PARTAGE_EGAL."
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Compare-and-swap atomique : ferme le compte SEULEMENT s'il est encore
      // OUVERT, dans la même transaction que la création des ventes. Nécessaire
      // car la vérification verifierCompteOuvert() ci-dessus est faite AVANT
      // cette transaction, sur une lecture qui peut être périmée — deux appels
      // concurrents à /encaisser sur le même compte (double-clic, deux postes)
      // passeraient sinon tous les deux cette vérification et généreraient des
      // ventes en double. Trouvé en testant contre la vraie base (une requête
      // dont la réponse HTTP a été interrompue continuait de s'exécuter côté
      // serveur, chevauchant une nouvelle tentative manuelle sur le même compte
      // encore marqué OUVERT, provoquant une violation de contrainte unique sur
      // numeroRecu au lieu d'un 409 propre).
      const fermeture = await tx.compteCafeteria.updateMany({
        where: { id: compteId, statut: "OUVERT" },
        data: { statut: "FERME", fermeLe: new Date(), syncVersion: { increment: 1 } },
      });
      if (fermeture.count === 0) {
        throw new ConflictException(
          "Ce compte cafétaria est déjà fermé (encaissé) — probablement encaissé entre-temps depuis un autre poste."
        );
      }

      switch (dto.mode) {
        case "GROUPE":
          return [await this.creerVenteGroupe(tx, compte, toutesLesLignes, dto, currentUser.userId)];
        case "PAR_SOUS_COMPTE":
          return this.creerVentesParSousCompte(tx, compte, dto, currentUser.userId);
        case "PARTAGE_EGAL":
          if (!dto.nombrePersonnes) {
            throw new BadRequestException("nombrePersonnes est obligatoire pour un encaissement PARTAGE_EGAL.");
          }
          return this.creerVentesPartageEgal(tx, compte, toutesLesLignes, dto, dto.nombrePersonnes, currentUser.userId);
        default:
          throw new BadRequestException(`Mode d'encaissement inconnu : ${dto.mode}.`);
      }
    });
  }

  async annulerVente(id: string, motif: string) {
    const vente = await this.prisma.venteCafeteria.findUnique({ where: { id } });
    if (!vente) {
      throw new NotFoundException(`Aucune vente trouvée avec l'identifiant ${id}.`);
    }
    if (vente.annuleLe) {
      throw new ConflictException("Cette vente est déjà annulée.");
    }
    return this.prisma.venteCafeteria.update({
      where: { id },
      data: { annuleLe: new Date(), motifAnnulation: motif, syncVersion: { increment: 1 } },
    });
  }

  findAllVentes(reservationLieeId?: string) {
    return this.prisma.venteCafeteria.findMany({
      where: { reservationLieeId },
      orderBy: { createdAt: "desc" },
    });
  }

  // ---------------------------------------------------------------------
  // Privé
  // ---------------------------------------------------------------------

  private verifierCompteOuvert(compte: { statut: string }) {
    if (compte.statut !== "OUVERT") {
      throw new ConflictException("Ce compte cafétaria est déjà fermé (encaissé).");
    }
  }

  private sommerParDevise(lignes: LigneAvecProduit[]) {
    return lignes.reduce(
      (acc, ligne) => {
        const montant = Number(ligne.quantite) * Number(ligne.prixUnitaire);
        if (ligne.devise === Devise.USD) acc.usd += montant;
        else acc.cdf += montant;
        return acc;
      },
      { usd: 0, cdf: 0 }
    );
  }

  /**
   * CAF-YYYYMMDD-#### (section 11.3). Basé sur le PLUS GRAND numéro déjà
   * utilisé aujourd'hui, jamais sur un COUNT() de lignes : un `count()` (la
   * première version de cette méthode) suppose une séquence sans trou, ce qui
   * est faux dès qu'un trou existe déjà (trouvé en testant PARTAGE_EGAL contre
   * la vraie base : un bug de comptage antérieur avait laissé les numéros
   * 0001, 0002, 0003, 0005, 0007 avec des trous en 0004/0006 — `count()`
   * valait 5, produisait ensuite "0006" PUIS "0007", qui existait déjà →
   * violation de contrainte unique au lieu d'un numéro libre). Chercher le
   * MAX existant reste correct même en présence de trous.
   */
  private async genererNumeroRecu(tx: Prisma.TransactionClient): Promise<string> {
    const aaaammjj = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const prefixe = `CAF-${aaaammjj}-`;
    const dernier = await tx.venteCafeteria.findFirst({
      where: { numeroRecu: { startsWith: prefixe } },
      orderBy: { numeroRecu: "desc" },
      select: { numeroRecu: true },
    });
    const dernierNumero = dernier ? parseInt(dernier.numeroRecu.slice(prefixe.length), 10) : 0;
    return `${prefixe}${String(dernierNumero + 1).padStart(4, "0")}`;
  }

  private async creerVenteGroupe(
    tx: Prisma.TransactionClient,
    compte: { id: string },
    lignes: LigneAvecProduit[],
    dto: EncaisserCompteDto,
    createdBy: string
  ) {
    const { usd, cdf } = this.sommerParDevise(lignes);

    if (usd > 0 && cdf > 0 && (dto.deviseRegleeParClient !== undefined || dto.montantRegleParClient !== undefined)) {
      throw new BadRequestException(
        "Ce compte mélange des articles en USD et en CDF : le paiement croisé automatique n'est pas " +
          "supporté pour un total mixte (section 9.4). Réglez en espèces classiques ou par mobile money."
      );
    }

    const deviseDue: Devise = usd > 0 ? Devise.USD : Devise.CDF;
    const dernierTaux = await tx.tauxChange.findFirst({ orderBy: { createdAt: "desc" } });

    const encaissement = calculerEncaissement({
      montantDu: usd > 0 ? usd : cdf,
      deviseDue,
      deviseRegleeParClient: dto.deviseRegleeParClient,
      montantRegleParClient: dto.montantRegleParClient,
      deviseRenduChoisie: dto.deviseRenduChoisie,
      cdfParUsd: dernierTaux ? Number(dernierTaux.cdfParUsd) : undefined,
    });

    return tx.venteCafeteria.create({
      data: {
        compteId: compte.id,
        montantTotalUSD: usd,
        montantTotalCDF: cdf,
        modePaiement: dto.modePaiement,
        deviseRegleeParClient: dto.deviseRegleeParClient,
        montantRegleParClient: dto.montantRegleParClient,
        tauxChangeApplique: encaissement.tauxChangeApplique,
        deviseMonnaieRendue: encaissement.deviseMonnaieRendue,
        montantMonnaieRendue: encaissement.montantMonnaieRendue,
        reservationLieeId: dto.reservationLieeId,
        createdBy,
        numeroRecu: await this.genererNumeroRecu(tx),
      },
    });
  }

  private async creerVentesParSousCompte(
    tx: Prisma.TransactionClient,
    compte: CompteComplet,
    dto: EncaisserCompteDto,
    createdBy: string
  ) {
    const sousComptesAvecLignes = compte.sousComptes.filter((sc) => sc.lignes.length > 0);
    const ventes = [];
    for (let i = 0; i < sousComptesAvecLignes.length; i++) {
      const { usd, cdf } = this.sommerParDevise(sousComptesAvecLignes[i].lignes);
      ventes.push(
        await tx.venteCafeteria.create({
          data: {
            compteId: compte.id,
            montantTotalUSD: usd,
            montantTotalCDF: cdf,
            modePaiement: dto.modePaiement,
            reservationLieeId: dto.reservationLieeId,
            createdBy,
            numeroRecu: await this.genererNumeroRecu(tx),
          },
        })
      );
    }
    return ventes;
  }

  private async creerVentesPartageEgal(
    tx: Prisma.TransactionClient,
    compte: { id: string },
    lignes: LigneAvecProduit[],
    dto: EncaisserCompteDto,
    n: number,
    createdBy: string
  ) {
    const { usd, cdf } = this.sommerParDevise(lignes);
    const partsUSD = repartirEnParts(usd, 2, n);
    const partsCDF = repartirEnParts(cdf, 0, n);

    const ventes = [];
    for (let i = 0; i < n; i++) {
      ventes.push(
        await tx.venteCafeteria.create({
          data: {
            compteId: compte.id,
            montantTotalUSD: partsUSD[i],
            montantTotalCDF: partsCDF[i],
            modePaiement: dto.modePaiement,
            reservationLieeId: dto.reservationLieeId,
            createdBy,
            numeroRecu: await this.genererNumeroRecu(tx),
          },
        })
      );
    }
    return ventes;
  }
}
