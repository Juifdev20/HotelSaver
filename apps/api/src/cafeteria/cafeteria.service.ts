import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Devise, Prisma, PrismaClient, StatutLigne, TypeProduit } from "@hotel-chicago/database";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { StockService } from "../stock/stock.service";
import { NotificationsService } from "../notifications/notifications.service";
import { messages } from "../notifications/messages";
import { calculerEncaissement } from "../factures/encaissement.util";
import { repartirEnParts } from "./partage.util";
import { OuvrirCompteDto } from "./dto/ouvrir-compte.dto";
import { AjouterSousCompteDto } from "./dto/ajouter-sous-compte.dto";
import { AjouterLigneDto } from "./dto/ajouter-ligne.dto";
import { EncaisserCompteDto } from "./dto/encaisser-compte.dto";
import { FindComptesQueryDto } from "./dto/find-comptes.query.dto";
import { MajStatutLigneDto } from "./dto/maj-statut-ligne.dto";
import { DefinirMenuDuJourDto } from "./dto/definir-menu-du-jour.dto";

const INCLUDE_COMPTE_COMPLET = {
  sousComptes: { include: { lignes: { include: { produit: true } } } },
  ventes: true,
} satisfies Prisma.CompteCafeteriaInclude;

/** Reprises quand deux postes tirent le même numéro de reçu au même instant. */
const ESSAIS_NUMERO_RECU = 5;

export interface OptionsEncaissement {
  /** Numéros des reçus provisoires (TEMP-…) remis au client hors ligne, dans l'ordre des ventes créées. */
  numerosProvisoires?: string[];
}

type CompteComplet = Prisma.CompteCafeteriaGetPayload<{ include: typeof INCLUDE_COMPTE_COMPLET }>;
type LigneAvecProduit = CompteComplet["sousComptes"][number]["lignes"][number];

@Injectable()
export class CafeteriaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly stockService: StockService,
    private readonly notifications: NotificationsService
  ) {}

  /**
   * Produits les plus ajoutés aux comptes depuis le début de la journée (fuseau de l'hôtel,
   * Africa/Lubumbashi = UTC+2 sans heure d'été) : l'écran « Ajouter » les met en tête.
   */
  async produitsPopulaires(hotelId: string, maintenant: Date = new Date()): Promise<{ produitId: string; quantite: number }[]> {
    const DECALAGE_MS = 2 * 60 * 60 * 1000;
    const jourMs = 24 * 60 * 60 * 1000;
    const local = maintenant.getTime() + DECALAGE_MS;
    const debut = new Date(local - (local % jourMs) - DECALAGE_MS);
    const lignes = await this.prisma.ligneCommande.groupBy({
      by: ["produitId"],
      where: { hotelId, createdAt: { gte: debut } },
      _sum: { quantite: true },
      orderBy: { _sum: { quantite: "desc" } },
      take: 30,
    });
    return lignes.map((l) => ({ produitId: l.produitId, quantite: Number(l._sum.quantite ?? 0) }));
  }

  findAllComptes(query: FindComptesQueryDto, hotelId: string) {
    return this.prisma.compteCafeteria.findMany({
      where: { hotelId, statut: query.statut },
      include: INCLUDE_COMPTE_COMPLET,
      orderBy: { ouvertLe: "desc" },
    });
  }

  async findOneCompte(id: string, hotelId: string): Promise<CompteComplet> {
    const compte = await this.prisma.compteCafeteria.findUnique({
      where: { id, hotelId },
      include: INCLUDE_COMPTE_COMPLET,
    });
    if (!compte) {
      throw new NotFoundException(`Aucun compte cafétaria trouvé avec l'identifiant ${id}.`);
    }
    return compte;
  }

  /**
   * Retrait d'une commande web : le client présente la référence courte de
   * son ticket (les 8 premiers caractères de l'id du compte, affichés sur la
   * confirmation du site et le ticket PDF). Uniquement les commandes
   * SITE_PUBLIC — un compte de comptoir n'a pas de référence à présenter.
   * Une fois la commande encaissée le compte passe FERME : la référence
   * devient obsolète (409), donc impossible de la réutiliser une deuxième
   * fois pour se faire servir gratuitement.
   */
  async trouverCompteParReference(reference: string, hotelId: string): Promise<CompteComplet> {
    const ref = reference.trim().toLowerCase();
    if (!/^[0-9a-f]{4,32}$/.test(ref)) {
      throw new BadRequestException("Référence invalide — elle se trouve sur le ticket du client (ex. E6A5E231).");
    }
    const correspondants = await this.prisma.compteCafeteria.findMany({
      where: { hotelId, origine: "SITE_PUBLIC", id: { startsWith: ref } },
      include: INCLUDE_COMPTE_COMPLET,
      orderBy: { ouvertLe: "desc" },
      take: 5,
    });
    const ouvert = correspondants.find((c) => c.statut === "OUVERT");
    if (ouvert) return ouvert;
    if (correspondants.length > 0) {
      throw new ConflictException("Cette commande a déjà été réglée et clôturée — la référence n'est plus valable.");
    }
    throw new NotFoundException("Aucune commande web ne correspond à cette référence.");
  }

  ouvrirCompte(dto: OuvrirCompteDto, currentUser: UtilisateurAuthentifie) {
    return this.prisma.compteCafeteria.create({
      data: {
        hotelId: currentUser.hotelId,
        tableOuNom: dto.tableOuNom,
        ouvertPar: currentUser.userId,
        // Une écriture imbriquée n'hérite PAS automatiquement du hotelId du
        // parent (constaté en lisant le SQL généré) : le sous-compte a besoin
        // du sien explicitement.
        sousComptes: { create: [{ hotelId: currentUser.hotelId, nom: dto.nomPremierSousCompte ?? "Personne 1" }] },
      },
      include: { sousComptes: true },
    });
  }

  async ajouterSousCompte(compteId: string, dto: AjouterSousCompteDto, hotelId: string) {
    const compte = await this.findOneCompte(compteId, hotelId);
    this.verifierCompteOuvert(compte);
    return this.prisma.sousCompte.create({ data: { hotelId, compteId, nom: dto.nom } });
  }

  async ajouterLigne(compteId: string, dto: AjouterLigneDto, currentUser: UtilisateurAuthentifie, options: { horsLigne?: boolean } = {}) {
    // Deux lectures indépendantes (aucune n'a besoin du résultat de l'autre) :
    // en parallèle plutôt que l'une après l'autre — chaque aller-retour
    // compte sur une connexion internet lente (voir DECISIONS.md, Phase 6).
    const [compte, produit] = await Promise.all([
      this.findOneCompte(compteId, currentUser.hotelId),
      this.prisma.produit.findUnique({ where: { id: dto.produitId, hotelId: currentUser.hotelId } }),
    ]);
    this.verifierCompteOuvert(compte);

    const sousCompte = compte.sousComptes.find((sc) => sc.id === dto.sousCompteId);
    if (!sousCompte) {
      throw new NotFoundException(`Le sous-compte ${dto.sousCompteId} n'appartient pas au compte ${compteId}.`);
    }
    if (sousCompte.payeLe) {
      throw new ConflictException(`${sousCompte.nom} a déjà réglé sa part : on ne peut plus lui ajouter de consommation.`);
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
    //
    // Un PLAT n'a pas de stock compté (on cuisine à la commande) : ni contrôle
    // ni décrément ni mouvement d'audit pour lui. Sauf si le patron a limité
    // les portions préparées (`portionsDisponibles`) : décrément conditionnel
    // — le WHERE `gte` garantit de ne jamais passer sous zéro (0 ligne
    // touchée = portions insuffisantes → 400, rien d'écrit).
    const estPlat = produit.typeProduit === TypeProduit.PLAT;
    if (!estPlat) {
      await this.stockService.decrementerStock(
        this.prisma,
        { hotelId: currentUser.hotelId, produitId: dto.produitId, type: "SORTIE_VENTE", quantite: dto.quantite },
        produit,
        { autoriserNegatif: options.horsLigne }
      );
    } else if (produit.portionsDisponibles != null) {
      const { count } = await this.prisma.produit.updateMany({
        where: { id: produit.id, hotelId: currentUser.hotelId, portionsDisponibles: { gte: dto.quantite } },
        data: { portionsDisponibles: { decrement: dto.quantite } },
      });
      if (count === 0) {
        throw new ConflictException(
          `Plus assez de portions de "${produit.nom}" pour cette commande (épuisé ou presque).`
        );
      }
    }

    // Une fois le stock validé, le mouvement d'audit (articles seulement) et
    // la ligne de commande sont deux écritures indépendantes (aucune n'a
    // besoin du résultat de l'autre) : envoyées en parallèle plutôt que l'une
    // après l'autre.
    const [, ligne] = await Promise.all([
      estPlat
        ? Promise.resolve(null)
        : this.prisma.mouvementStock.create({
            data: {
              hotelId: currentUser.hotelId,
              produitId: dto.produitId,
              quantite: dto.quantite,
              type: "SORTIE_VENTE",
              motif: `Vente cafétaria — compte "${compte.tableOuNom}"`,
              createdBy: currentUser.userId,
            },
          }),
      this.prisma.ligneCommande.create({
        data: {
          hotelId: currentUser.hotelId,
          sousCompteId: dto.sousCompteId,
          produitId: dto.produitId,
          quantite: dto.quantite,
          prixUnitaire: produit.prix,
          devise: produit.devise,
          // Seul un plat entre dans la file de production (quand la cuisine
          // interne est activée) ; un article de comptoir est servi dès la
          // vente — vendre une bière n'encombre pas l'écran du cuisinier.
          statut: estPlat && currentUser.cuisineActivee ? StatutLigne.EN_ATTENTE : StatutLigne.SERVI,
        },
        include: { produit: true },
      }),
    ]);

    return ligne;
  }

  async encaisser(compteId: string, dto: EncaisserCompteDto, currentUser: UtilisateurAuthentifie, options: OptionsEncaissement = {}) {
    // Deux postes qui encaissent au même instant peuvent tirer le même numéro de reçu : la contrainte d'unicité refuse
    // l'un des deux ENTIER (la transaction est annulée, aucune part n'est marquée payée) et on repart avec les suivants.
    for (let essai = 1; ; essai++) {
      try {
        return await this.encaisserUneFois(compteId, dto, currentUser, options);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002" || essai >= ESSAIS_NUMERO_RECU) throw error;
      }
    }
  }

  private async encaisserUneFois(compteId: string, dto: EncaisserCompteDto, currentUser: UtilisateurAuthentifie, options: OptionsEncaissement) {
    const compteComplet = await this.findOneCompte(compteId, currentUser.hotelId);
    this.verifierCompteOuvert(compteComplet);

    // Une personne qui a déjà réglé SA part (encaissement individuel) n'est plus à encaisser :
    // GROUPE / PAR_SOUS_COMPTE / PARTAGE_EGAL ne portent que sur ce qui reste dû.
    const compte = { ...compteComplet, sousComptes: compteComplet.sousComptes.filter((sc) => !sc.payeLe) };
    const toutesLesLignes = compte.sousComptes.flatMap((sc) => sc.lignes);
    if (toutesLesLignes.length === 0) {
      throw new BadRequestException("Impossible d'encaisser un compte sans aucune ligne de commande à régler.");
    }

    let personne: (typeof compte.sousComptes)[number] | undefined;
    if (dto.mode === "UNE_PERSONNE") {
      if (!dto.sousCompteId) throw new BadRequestException("sousCompteId est obligatoire pour un encaissement UNE_PERSONNE.");
      personne = compte.sousComptes.find((sc) => sc.id === dto.sousCompteId);
      if (!personne) {
        const dejaPayee = compteComplet.sousComptes.find((sc) => sc.id === dto.sousCompteId)?.payeLe;
        if (dejaPayee) throw new ConflictException("Cette personne a déjà réglé sa part.");
        throw new NotFoundException(`Le sous-compte ${dto.sousCompteId} n'appartient pas au compte ${compteId}.`);
      }
      if (personne.lignes.length === 0) {
        throw new BadRequestException(`${personne.nom} n'a aucune consommation à régler.`);
      }
    }

    if (dto.modePaiement === "FACTURE_CHAMBRE" && !dto.reservationLieeId) {
      throw new BadRequestException("reservationLieeId est obligatoire pour un règlement FACTURE_CHAMBRE.");
    }
    if (dto.reservationLieeId) {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: dto.reservationLieeId, hotelId: currentUser.hotelId },
      });
      if (!reservation) {
        throw new NotFoundException(`Aucune réservation trouvée avec l'identifiant ${dto.reservationLieeId}.`);
      }
    }

    const paiementCroiseDemande = dto.deviseRegleeParClient !== undefined || dto.montantRegleParClient !== undefined;
    if (paiementCroiseDemande && dto.mode !== "GROUPE" && dto.mode !== "UNE_PERSONNE") {
      throw new BadRequestException(
        "Le paiement croisé n'est calculé que pour les modes d'encaissement GROUPE et UNE_PERSONNE dans cette version. " +
          "Encaissez chaque vente séparément pour PAR_SOUS_COMPTE ou PARTAGE_EGAL."
      );
    }

    if (dto.mode === "PARTAGE_EGAL" && !dto.nombrePersonnes) {
      throw new BadRequestException("nombrePersonnes est obligatoire pour un encaissement PARTAGE_EGAL.");
    }

    const { hotelId, userId } = currentUser;

    return this.prisma.$transaction(async (tx) => {
      // Les personnes réglées par cet encaissement : une seule (UNE_PERSONNE) ou toutes celles qui ont des lignes.
      const reglees = personne ? [personne] : compte.sousComptes.filter((sc) => sc.lignes.length > 0);
      // Même compare-and-swap que pour le compte, au niveau de la personne : deux postes qui encaissent
      // la même personne en même temps ne génèrent pas deux reçus.
      const maintenant = new Date();
      for (const sc of reglees) {
        const marque = await tx.sousCompte.updateMany({
          where: { id: sc.id, hotelId, payeLe: null },
          data: { payeLe: maintenant, syncVersion: { increment: 1 } },
        });
        if (marque.count === 0) {
          throw new ConflictException(`${sc.nom} a déjà réglé sa part — probablement encaissée entre-temps depuis un autre poste.`);
        }
      }

      // Le compte se ferme quand plus personne n'a de consommation à régler (compare-and-swap atomique : ferme
      // le compte SEULEMENT s'il est encore OUVERT, dans la même transaction que la création des ventes —
      // deux appels concurrents à /encaisser passeraient sinon la vérification faite AVANT la transaction
      // et généreraient des ventes en double ; trouvé en testant contre la vraie base).
      const idsRegles = new Set(reglees.map((sc) => sc.id));
      const resteADevoir = compte.sousComptes.some((sc) => sc.lignes.length > 0 && !idsRegles.has(sc.id));
      if (!resteADevoir) {
        const fermeture = await tx.compteCafeteria.updateMany({
          where: { id: compteId, hotelId, statut: "OUVERT" },
          data: { statut: "FERME", fermeLe: maintenant, syncVersion: { increment: 1 } },
        });
        if (fermeture.count === 0) {
          throw new ConflictException(
            "Ce compte cafétaria est déjà fermé (encaissé) — probablement encaissé entre-temps depuis un autre poste."
          );
        }
      }

      switch (dto.mode) {
        case "GROUPE":
          return [await this.creerVenteGroupe(tx, compte, toutesLesLignes, dto, hotelId, userId, undefined, options.numerosProvisoires?.[0])];
        case "UNE_PERSONNE":
          return [await this.creerVenteGroupe(tx, compte, personne!.lignes, dto, hotelId, userId, personne!.id, options.numerosProvisoires?.[0])];
        case "PAR_SOUS_COMPTE":
          return this.creerVentesParSousCompte(tx, compte, dto, hotelId, userId, options.numerosProvisoires);
        case "PARTAGE_EGAL":
          if (!dto.nombrePersonnes) {
            throw new BadRequestException("nombrePersonnes est obligatoire pour un encaissement PARTAGE_EGAL.");
          }
          return this.creerVentesPartageEgal(tx, compte, toutesLesLignes, dto, dto.nombrePersonnes, hotelId, userId, options.numerosProvisoires);
        default:
          throw new BadRequestException(`Mode d'encaissement inconnu : ${dto.mode}.`);
      }
    });
  }

  async annulerVente(id: string, motif: string, hotelId: string, par?: UtilisateurAuthentifie) {
    const vente = await this.prisma.venteCafeteria.findUnique({ where: { id, hotelId } });
    if (!vente) {
      throw new NotFoundException(`Aucune vente trouvée avec l'identifiant ${id}.`);
    }
    if (vente.annuleLe) {
      throw new ConflictException("Cette vente est déjà annulée.");
    }
    const annulee = await this.prisma.venteCafeteria.update({
      where: { id, hotelId },
      data: { annuleLe: new Date(), motifAnnulation: motif, syncVersion: { increment: 1 } },
    });
    // Seul le patron peut annuler une vente encaissée (matrice 9.3) : il est alors l'auteur, et n'a rien à apprendre de sa propre action.
    if (par?.role !== Role.PATRON) {
      void this.notifications.emettre({
        hotelId,
        roles: [Role.PATRON],
        ...messages.recuAnnule({ numeroRecu: vente.numeroRecu, motif, par: par?.nom }),
      });
    }
    return annulee;
  }

  findAllVentes(hotelId: string, reservationLieeId?: string) {
    return this.prisma.venteCafeteria.findMany({
      where: { hotelId, reservationLieeId },
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
   * MAX existant reste correct même en présence de trous. Numéroté par hôtel
   * (Phase 2) : `numeroRecu` n'est plus unique que combiné à `hotelId`.
   */
  private async genererNumeroRecu(tx: Prisma.TransactionClient, hotelId: string): Promise<string> {
    const aaaammjj = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const prefixe = `CAF-${aaaammjj}-`;
    const dernier = await tx.venteCafeteria.findFirst({
      where: { hotelId, numeroRecu: { startsWith: prefixe } },
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
    hotelId: string,
    createdBy: string,
    sousCompteId?: string,
    numeroProvisoire?: string
  ) {
    const { usd, cdf } = this.sommerParDevise(lignes);

    if (usd > 0 && cdf > 0 && (dto.deviseRegleeParClient !== undefined || dto.montantRegleParClient !== undefined)) {
      throw new BadRequestException(
        "Ce compte mélange des articles en USD et en CDF : le paiement croisé automatique n'est pas " +
          "supporté pour un total mixte (section 9.4). Réglez en espèces classiques ou par mobile money."
      );
    }

    const deviseDue: Devise = usd > 0 ? Devise.USD : Devise.CDF;
    const dernierTaux = await tx.tauxChange.findFirst({ where: { hotelId }, orderBy: { createdAt: "desc" } });

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
        hotelId,
        compteId: compte.id,
        sousCompteId,
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
        numeroRecu: await this.genererNumeroRecu(tx, hotelId),
        numeroProvisoire,
      },
    });
  }

  private async creerVentesParSousCompte(
    tx: Prisma.TransactionClient,
    compte: CompteComplet,
    dto: EncaisserCompteDto,
    hotelId: string,
    createdBy: string,
    numerosProvisoires?: string[]
  ) {
    const sousComptesAvecLignes = compte.sousComptes.filter((sc) => sc.lignes.length > 0);
    const ventes = [];
    for (let i = 0; i < sousComptesAvecLignes.length; i++) {
      const { usd, cdf } = this.sommerParDevise(sousComptesAvecLignes[i].lignes);
      ventes.push(
        await tx.venteCafeteria.create({
          data: {
            hotelId,
            compteId: compte.id,
            montantTotalUSD: usd,
            montantTotalCDF: cdf,
            modePaiement: dto.modePaiement,
            reservationLieeId: dto.reservationLieeId,
            createdBy,
            numeroRecu: await this.genererNumeroRecu(tx, hotelId),
            numeroProvisoire: numerosProvisoires?.[i],
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
    hotelId: string,
    createdBy: string,
    numerosProvisoires?: string[]
  ) {
    const { usd, cdf } = this.sommerParDevise(lignes);
    const partsUSD = repartirEnParts(usd, 2, n);
    const partsCDF = repartirEnParts(cdf, 0, n);

    const ventes = [];
    for (let i = 0; i < n; i++) {
      ventes.push(
        await tx.venteCafeteria.create({
          data: {
            hotelId,
            compteId: compte.id,
            montantTotalUSD: partsUSD[i],
            montantTotalCDF: partsCDF[i],
            modePaiement: dto.modePaiement,
            reservationLieeId: dto.reservationLieeId,
            createdBy,
            numeroRecu: await this.genererNumeroRecu(tx, hotelId),
            numeroProvisoire: numerosProvisoires?.[i],
          },
        })
      );
    }
    return ventes;
  }

  // ---------------------------------------------------------------------------
  // Statut de ligne (cycle de vie cuisine)
  // ---------------------------------------------------------------------------

  /**
   * Met à jour le statut d'une ligne de commande.
   * Règles : EN_ATTENTE → EN_PREPARATION → PRET → SERVI (ordre croissant obligatoire).
   * Horodate automatiquement `prisEnChargeA` et `pretA`.
   */
  async majStatutLigne(ligneId: string, dto: MajStatutLigneDto, hotelId: string) {
    const ligne = await this.prisma.ligneCommande.findUnique({ where: { id: ligneId, hotelId } });
    if (!ligne) throw new NotFoundException(`Ligne de commande introuvable.`);

    const ordre: StatutLigne[] = [StatutLigne.EN_ATTENTE, StatutLigne.EN_PREPARATION, StatutLigne.PRET, StatutLigne.SERVI];
    const actuel = ordre.indexOf(ligne.statut as StatutLigne);
    const prochain = ordre.indexOf(dto.statut as unknown as StatutLigne);
    if (prochain <= actuel) {
      throw new BadRequestException(`Impossible de passer de « ${ligne.statut} » à « ${dto.statut} » : l'ordre doit être croissant.`);
    }

    return this.prisma.ligneCommande.update({
      where: { id: ligneId },
      data: {
        statut: dto.statut as unknown as StatutLigne,
        prisEnChargeA: dto.statut === "EN_PREPARATION" ? new Date() : undefined,
        pretA:         dto.statut === "PRET"           ? new Date() : undefined,
        syncVersion:   { increment: 1 },
      },
      include: { produit: true },
    });
  }

  /**
   * Lignes actives pour l'écran de cuisine : EN_ATTENTE et EN_PREPARATION,
   * groupées par compte, triées du plus ancien au plus récent. Renvoie une
   * liste vide si l'hôtel n'a pas activé le suivi cuisine (vente au comptoir).
   */
  async lignesPourCuisine(currentUser: UtilisateurAuthentifie) {
    if (!currentUser.cuisineActivee) return [];
    const { hotelId } = currentUser;
    const lignes = await this.prisma.ligneCommande.findMany({
      where: {
        hotelId,
        statut: { in: [StatutLigne.EN_ATTENTE, StatutLigne.EN_PREPARATION] },
        sousCompte: { payeLe: null, compte: { statut: "OUVERT" } },
      },
      include: {
        produit: true,
        sousCompte: {
          include: { compte: { select: { id: true, tableOuNom: true, ouvertLe: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const parCompte = new Map<string, {
      compteId: string;
      tableOuNom: string;
      ouvertLe: Date;
      lignes: typeof lignes;
    }>();

    for (const ligne of lignes) {
      const { compte } = ligne.sousCompte;
      if (!parCompte.has(compte.id)) {
        parCompte.set(compte.id, { compteId: compte.id, tableOuNom: compte.tableOuNom, ouvertLe: compte.ouvertLe, lignes: [] });
      }
      parCompte.get(compte.id)!.lignes.push(ligne);
    }

    return Array.from(parCompte.values());
  }

  // ---------------------------------------------------------------------------
  // Menu du jour
  // ---------------------------------------------------------------------------

  /** Retourne le menu du jour actif pour la date en cours (fuseau Africa/Lubumbashi). */
  async menuDuJour(hotelId: string) {
    const dateLocale = this.dateLocaleAujourdhui();
    return this.prisma.menuDuJour.findUnique({
      where: { hotelId_date: { hotelId, date: dateLocale } },
      include: { items: { include: { produit: true } } },
    });
  }

  /**
   * Définit (crée ou remplace) le menu du jour.
   * Upsert : si un menu existe déjà pour aujourd'hui, ses items sont remplacés.
   */
  async definirMenuDuJour(dto: DefinirMenuDuJourDto, currentUser: UtilisateurAuthentifie) {
    const hotelId = currentUser.hotelId;
    const dateLocale = this.dateLocaleAujourdhui();

    const produits = await this.prisma.produit.findMany({
      where: { id: { in: dto.items.map((i) => i.produitId) }, hotelId, actif: true },
    });
    if (produits.length !== dto.items.length) {
      throw new NotFoundException("Un ou plusieurs produits sont introuvables ou inactifs.");
    }

    const existant = await this.prisma.menuDuJour.findUnique({ where: { hotelId_date: { hotelId, date: dateLocale } } });

    if (existant) {
      await this.prisma.menuDuJourItem.deleteMany({ where: { menuId: existant.id } });
      await this.prisma.menuDuJourItem.createMany({
        data: dto.items.map((item) => ({
          id: crypto.randomUUID(),
          menuId: existant.id,
          produitId: item.produitId,
          prixSpecial: item.prixSpecial ?? null,
          deviseSpeciale: item.deviseSpeciale ?? null,
        })),
      });
      return this.prisma.menuDuJour.findUnique({
        where: { id: existant.id },
        include: { items: { include: { produit: true } } },
      });
    }

    return this.prisma.menuDuJour.create({
      data: {
        id: crypto.randomUUID(),
        hotelId,
        date: dateLocale,
        createdBy: currentUser.userId,
        items: {
          create: dto.items.map((item) => ({
            id: crypto.randomUUID(),
            produitId: item.produitId,
            prixSpecial: item.prixSpecial ?? null,
            deviseSpeciale: item.deviseSpeciale ?? null,
          })),
        },
      },
      include: { items: { include: { produit: true } } },
    });
  }

  /** Supprime un item du menu du jour. */
  async supprimerItemMenu(itemId: string, hotelId: string) {
    const item = await this.prisma.menuDuJourItem.findUnique({
      where: { id: itemId },
      include: { menu: { select: { hotelId: true } } },
    });
    if (!item || item.menu.hotelId !== hotelId) throw new NotFoundException("Item introuvable.");
    await this.prisma.menuDuJourItem.delete({ where: { id: itemId } });
    return { ok: true };
  }

  private dateLocaleAujourdhui(): Date {
    const DECALAGE_MS = 2 * 60 * 60 * 1000;
    const maintenant = new Date(Date.now() + DECALAGE_MS);
    return new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  }
}
