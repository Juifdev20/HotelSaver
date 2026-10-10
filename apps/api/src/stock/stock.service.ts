import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConflitTransitoireException } from "../common/conflit-transitoire.exception";
import { Prisma, PrismaClient, Produit } from "@hotel-chicago/database";
import { Role } from "@hotel-chicago/types";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { SupabaseStorageService } from "../common/supabase-storage/supabase-storage.service";
import { messages } from "../notifications/messages";
import { CreateMouvementDto } from "./dto/create-mouvement.dto";
import { FindMouvementsQueryDto } from "./dto/find-mouvements.query.dto";
import { LancerInventaireDto } from "./dto/lancer-inventaire.dto";
import { TypeMouvement } from "./types-mouvement";
import { BrandingPdf } from "../rapports/pdf/commun";
import { genererPdfInventaire } from "../rapports/pdf/inventaire";

type ClientOuTransaction = PrismaClient | Prisma.TransactionClient;

export interface ParamsMouvement {
  hotelId: string;
  produitId: string;
  type: TypeMouvement;
  quantite: number;
  motif?: string;
  createdBy: string;
}

@Injectable()
export class StockService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notifications: NotificationsService,
    private readonly storage: SupabaseStorageService
  ) {}

  findAll(query: FindMouvementsQueryDto, hotelId: string) {
    return this.prisma.mouvementStock.findMany({
      where: { hotelId, produitId: query.produitId },
      include: { produit: true },
      orderBy: { createdAt: "desc" },
    });
  }

  create(dto: CreateMouvementDto, createdBy: string, hotelId: string) {
    return this.enregistrerMouvement(this.prisma, {
      hotelId,
      produitId: dto.produitId,
      type: dto.type,
      quantite: dto.quantite,
      motif: dto.motif,
      createdBy,
    });
  }

  /**
   * Ne fait que vérifier et appliquer la variation de stock, sans créer la
   * ligne `MouvementStock` — extrait de `enregistrerMouvement` pour que
   * CafeteriaService puisse créer ce mouvement et la ligne de commande EN
   * PARALLÈLE une fois le stock validé, au lieu de 3 aller-retours séquentiels
   * vers une base à l'autre bout d'une connexion lente (service cafétaria
   * jugé trop lent en conditions réelles, 26/09/2026 — chaque aller-retour
   * réseau compte). `produitDejaCharge` évite une deuxième lecture quand
   * l'appelant a déjà le produit en main (cas de CafeteriaService.ajouterLigne,
   * qui le lit pour vérifier `actif` avant d'appeler ceci).
   *
   * N'utilise plus `$transaction(async tx => ...)` pour l'écriture (retiré le
   * 26/09/2026) : le pooler Supabase est coincé en mode "transaction" depuis
   * la panne du mode "session" du 25/09/2026 (voir DECISIONS.md), incompatible
   * avec les transactions interactives Prisma ("Transaction not found"
   * systématique). À la place, `updateMany` conditionné sur la valeur déjà lue
   * (`stockActuel` dans le WHERE) : si un mouvement concurrent a changé le
   * stock entre-temps, `count` vaut 0 et on relance une erreur métier plutôt
   * que d'écraser une valeur périmée — remplace l'isolation de la transaction
   * par une vérification optimiste.
   */
  async decrementerStock(
    client: ClientOuTransaction,
    params: Pick<ParamsMouvement, "hotelId" | "produitId" | "type" | "quantite">,
    produitDejaCharge?: Pick<Produit, "nom" | "stockActuel"> & Partial<Pick<Produit, "seuilAlerte">>,
    options: { autoriserNegatif?: boolean } = {}
  ): Promise<void> {
    const produit =
      produitDejaCharge ?? (await client.produit.findUnique({ where: { id: params.produitId, hotelId: params.hotelId } }));
    if (!produit) {
      throw new NotFoundException(`Aucun produit trouvé avec l'identifiant ${params.produitId}.`);
    }

    let delta: number;
    switch (params.type) {
      case "ENTREE":
        if (params.quantite <= 0) {
          throw new BadRequestException("La quantité doit être positive pour une entrée de stock.");
        }
        delta = params.quantite;
        break;
      case "SORTIE_VENTE":
      case "PERTE":
        if (params.quantite <= 0) {
          throw new BadRequestException(
            `La quantité doit être positive pour un mouvement ${params.type} (le sens est déjà porté par le type).`
          );
        }
        delta = -params.quantite;
        break;
      case "AJUSTEMENT":
        delta = params.quantite;
        break;
    }

    const nouveauStock = Number(produit.stockActuel) + delta;
    // Une vente faite hors ligne a déjà eu lieu : on l'enregistre même si le stock du serveur est insuffisant (le stock devient
    // négatif, l'alerte de rupture part, le patron régularise) plutôt que de perdre la trace d'une vente encaissée.
    if (nouveauStock < 0 && !options.autoriserNegatif) {
      throw new ConflictException(
        `Stock insuffisant pour "${produit.nom}" : ${produit.stockActuel} en stock, ` +
          `${Math.abs(delta)} demandé(s).`
      );
    }

    const { count } = await client.produit.updateMany({
      where: { id: params.produitId, hotelId: params.hotelId, stockActuel: produit.stockActuel },
      data: { stockActuel: nouveauStock, syncVersion: { increment: 1 } },
    });
    if (count === 0) {
      throw new ConflitTransitoireException(`Le stock de "${produit.nom}" a changé entre-temps, réessayez.`);
    }

    this.alerterSiSeuilFranchi(params, produit, nouveauStock, delta);
  }

  /**
   * Point UNIQUE par où passe toute variation de stock (ventes cafétaria, synchronisation, écran Stock) :
   * l'alerte part donc quel que soit le chemin. On alerte au FRANCHISSEMENT du seuil (de « au-dessus » à
   * « au seuil ou en dessous », puis à zéro), pas à chaque vente : pas de spam, et réarmée dès qu'un
   * réapprovisionnement remonte le stock au-dessus du seuil.
   */
  private alerterSiSeuilFranchi(
    params: Pick<ParamsMouvement, "hotelId" | "produitId">,
    produit: Pick<Produit, "nom" | "stockActuel"> & Partial<Pick<Produit, "seuilAlerte">>,
    nouveauStock: number,
    delta: number
  ): void {
    if (delta >= 0) return;
    const avant = Number(produit.stockActuel);
    const roles = [Role.CAFETARIA, Role.PATRON];

    if (nouveauStock === 0 && avant > 0) {
      void this.notifications.emettre({ hotelId: params.hotelId, roles, ...messages.stockEpuise({ produit: produit.nom, produitId: params.produitId }) });
      return;
    }
    const seuil = produit.seuilAlerte === undefined ? null : Number(produit.seuilAlerte);
    if (seuil !== null && nouveauStock > 0 && nouveauStock <= seuil && avant > seuil) {
      void this.notifications.emettre({
        hotelId: params.hotelId,
        roles,
        ...messages.stockBas({ produit: produit.nom, stock: nouveauStock, produitId: params.produitId }),
      });
    }
  }

  // ── Inventaire physique ────────────────────────────────────────────────────

  /**
   * Reconstitue le stock théorique à la fin de la période pour chaque produit
   * actif de l'hôtel : part du stockActuel courant puis annule les mouvements
   * postérieurs à dateFin (même algorithme que agregatCafeteria pour stockCloture).
   */
  async preparerInventaire(dateDebut: string, dateFin: string, hotelId: string) {
    const debut = new Date(dateDebut);
    const fin   = new Date(dateFin);
    fin.setUTCHours(23, 59, 59, 999);

    const produits = await this.prisma.produit.findMany({
      // Les plats n'ont pas de stock compté (préparés à la commande) : ils
      // n'ont rien à faire dans un inventaire physique.
      where: { hotelId, actif: true, typeProduit: "ARTICLE" },
      select: { id: true, nom: true, categorie: true, prix: true, devise: true, prixAchat: true, stockActuel: true },
      orderBy: [{ categorie: "asc" }, { nom: "asc" }],
    });

    const mouvements = await this.prisma.mouvementStock.findMany({
      where: { hotelId, createdAt: { gte: debut } },
      select: { produitId: true, quantite: true, type: true, createdAt: true },
    });

    return produits.map((p) => {
      const mouvs = mouvements.filter((m) => m.produitId === p.id);
      let apresFin = 0;
      let entrees = 0, sortiesVentes = 0, pertes = 0, ajustements = 0;
      for (const m of mouvs) {
        const q    = Number(m.quantite);
        const signe = m.type === "ENTREE" || m.type === "AJUSTEMENT" ? 1 : -1;
        if (m.createdAt > fin) {
          apresFin += signe * q;
          continue;
        }
        if (m.type === "ENTREE")          entrees       += q;
        else if (m.type === "SORTIE_VENTE") sortiesVentes += q;
        else if (m.type === "PERTE")      pertes        += q;
        else                               ajustements  += q;
      }
      const stockTheorique = Number(p.stockActuel) - apresFin;
      return {
        produitId:     p.id,
        nom:           p.nom,
        categorie:     p.categorie,
        prix:          String(p.prix),
        devise:        p.devise,
        prixAchat:     p.prixAchat != null ? String(p.prixAchat) : undefined,
        stockActuel:   String(p.stockActuel),
        stockTheorique,
        entrees,
        sortiesVentes,
        pertes,
        ajustements,
      };
    });
  }

  /** Crée l'inventaire en base, génère le PDF et l'enregistre dans Supabase Storage. */
  async creerInventaire(dto: LancerInventaireDto, createdBy: string, hotelId: string) {
    // Chaque produit compté doit appartenir à CET hôtel : sans ce contrôle, un identifiant de produit d'un autre hôtel
    // serait rattaché à l'inventaire et son nom, sa catégorie et son prix reviendraient dans la réponse et le PDF.
    const idsProduits = [...new Set(dto.items.map((item) => item.produitId))];
    const connus = await this.prisma.produit.count({ where: { hotelId, id: { in: idsProduits } } });
    if (connus !== idsProduits.length) {
      throw new BadRequestException("Un ou plusieurs produits de l'inventaire sont introuvables.");
    }
    const theoriques = await this.preparerInventaire(dto.dateDebut, dto.dateFin, hotelId);
    const mapTheo = new Map(theoriques.map((l) => [l.produitId, l]));

    // 1. Créer l'enregistrement + les items
    const inventaire = await this.prisma.inventairePhysique.create({
      data: {
        hotelId,
        dateDebut:  new Date(dto.dateDebut),
        dateFin:    new Date(dto.dateFin),
        titre:      dto.titre,
        createdBy,
        items: {
          create: dto.items.map((item) => {
            const theo = mapTheo.get(item.produitId)?.stockTheorique ?? 0;
            return {
              produitId:      item.produitId,
              stockTheorique: theo,
              stockPhysique:  item.stockPhysique,
              ecart:          item.stockPhysique - theo,
              note:           item.note,
            };
          }),
        },
      },
      include: { items: { include: { produit: true } } },
    });

    // 2. Branding de l'hôtel (sans logo — aucune dépendance sharp dans ce module)
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      include: { branding: true },
    });
    const palette  = hotel.branding?.palette as { light?: { navy?: string } } | null;
    const branding: BrandingPdf = {
      nom:       hotel.nom,
      adresse:   hotel.adresse,
      telephone: hotel.telephoneContact,
      logo:      null,
      couleur:   palette?.light?.navy ?? undefined,
    };

    // 3. Générer le PDF
    const lignesPdf = inventaire.items.map((item) => ({
      produit:        item.produit.nom,
      categorie:      item.produit.categorie,
      prix:           String(item.produit.prix),
      devise:         String(item.produit.devise),
      prixAchat:      item.produit.prixAchat != null ? String(item.produit.prixAchat) : null,
      stockTheorique: Number(item.stockTheorique),
      stockPhysique:  Number(item.stockPhysique),
      ecart:          Number(item.ecart),
      note:           item.note,
    }));
    const pdfBuffer = await genererPdfInventaire(
      {
        dateDebut:  dto.dateDebut,
        dateFin:    dto.dateFin,
        titre:      dto.titre,
        createdAt:  inventaire.createdAt.toISOString(),
        createdBy,
        lignes:     lignesPdf,
      },
      branding
    );

    // 4. Upload PDF + mise à jour pdfUrl
    const chemin = `${hotelId}/inventaires/${inventaire.id}.pdf`;
    await this.storage.envoyerRapportPdf(chemin, pdfBuffer);
    const pdfUrl = await this.storage.urlSigneeRapport(chemin, 3600 * 24 * 365); // URL longue durée (1 an)

    await this.prisma.inventairePhysique.update({
      where: { id: inventaire.id },
      data: { pdfUrl: chemin }, // on stocke le chemin, pas l'URL signée (elle expire)
    });

    return { ...inventaire, pdfUrl };
  }

  listerInventaires(hotelId: string) {
    return this.prisma.inventairePhysique.findMany({
      where: { hotelId },
      include: { items: { include: { produit: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retourne une URL signée courte (5 min) pour télécharger le PDF d'un inventaire.
   * Le chemin stocké dans `pdfUrl` est le chemin relatif dans le bucket (pas l'URL complète).
   */
  async urlPdfInventaire(id: string, hotelId: string): Promise<string> {
    const inv = await this.prisma.inventairePhysique.findUnique({ where: { id, hotelId } });
    if (!inv) throw new NotFoundException(`Inventaire ${id} introuvable.`);
    if (!inv.pdfUrl) throw new NotFoundException("Le PDF de cet inventaire n'est pas disponible.");
    return this.storage.urlSigneeRapport(inv.pdfUrl);
  }

  /**
   * Cœur partagé de toute variation de stock : décrémente/incrémente puis
   * enregistre la ligne `MouvementStock`. Utilisé par `create()` ci-dessus
   * (écran Stock, pas un chemin à haute fréquence) ; CafeteriaService
   * n'appelle plus cette méthode directement (voir `decrementerStock`
   * ci-dessus) pour pouvoir paralléliser sa propre écriture.
   */
  async enregistrerMouvement(client: ClientOuTransaction, params: ParamsMouvement, produitDejaCharge?: Pick<Produit, "nom" | "stockActuel">) {
    await this.decrementerStock(client, params, produitDejaCharge);

    return client.mouvementStock.create({
      data: {
        hotelId: params.hotelId,
        produitId: params.produitId,
        quantite: params.quantite,
        type: params.type,
        motif: params.motif,
        createdBy: params.createdBy,
      },
    });
  }
}
