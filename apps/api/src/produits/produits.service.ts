import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@hotel-chicago/database";
import { PRISMA } from "../prisma/prisma.module";
import { CreateProduitDto } from "./dto/create-produit.dto";
import { UpdateProduitDto } from "./dto/update-produit.dto";
import { FindProduitsQueryDto } from "./dto/find-produits.query.dto";

@Injectable()
export class ProduitsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  findAll(query: FindProduitsQueryDto, hotelId: string) {
    return this.prisma.produit.findMany({
      where: { hotelId, categorie: query.categorie, actif: query.actif },
      orderBy: [{ categorie: "asc" }, { nom: "asc" }],
    });
  }

  async findOne(id: string, hotelId: string) {
    const produit = await this.prisma.produit.findUnique({ where: { id, hotelId } });
    if (!produit) {
      throw new NotFoundException(`Aucun produit trouvé avec l'identifiant ${id}.`);
    }
    return produit;
  }

  /** « 6 001 234 » → « 6001234 » ; chaîne vide → null (pas de code). */
  private static normaliserCode(code: string | null | undefined): string | null | undefined {
    if (code === undefined || code === null) return code;
    const net = code.replace(/\s+/g, "");
    return net === "" ? null : net;
  }

  /** Un code-barres déjà pris dans l'hôtel (index unique hotelId+codeBarres)
   * devient un 409 lisible qui nomme le produit concerné. */
  private async ecrireAvecCodeUnique<T>(hotelId: string, code: string | null | undefined, ecrire: () => Promise<T>): Promise<T> {
    try {
      return await ecrire();
    } catch (error) {
      if (code && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existant = await this.prisma.produit.findFirst({ where: { hotelId, codeBarres: code }, select: { nom: true } });
        throw new ConflictException(`Ce code-barres est déjà utilisé par « ${existant?.nom ?? "un autre produit"} ».`);
      }
      throw error;
    }
  }

  async create(dto: CreateProduitDto, hotelId: string) {
    const codeBarres = ProduitsService.normaliserCode(dto.codeBarres);
    if (codeBarres && dto.typeProduit === "PLAT") {
      throw new BadRequestException("Un plat préparé n'a pas de code-barres : réservé aux articles de comptoir.");
    }
    return this.ecrireAvecCodeUnique(hotelId, codeBarres, () =>
      this.prisma.produit.create({ data: { ...dto, codeBarres, hotelId, stockActuel: dto.stockActuel ?? 0 } })
    );
  }

  async update(id: string, dto: UpdateProduitDto, hotelId: string) {
    const actuel = await this.findOne(id, hotelId);
    const devientPlat = (dto.typeProduit ?? actuel.typeProduit) === "PLAT";
    let codeBarres = ProduitsService.normaliserCode(dto.codeBarres);
    if (devientPlat && codeBarres) {
      throw new BadRequestException("Un plat préparé n'a pas de code-barres : réservé aux articles de comptoir.");
    }
    // Un article qui devient plat perd son code (sinon il resterait scannable).
    if (devientPlat && actuel.codeBarres) codeBarres = null;
    // syncVersion incrémenté manuellement (voir ChambresService.update pour le
    // détail complet) — indispensable pour la détection de conflit hors ligne.
    return this.ecrireAvecCodeUnique(hotelId, codeBarres, () =>
      this.prisma.produit.update({
        where: { id, hotelId },
        data: { ...dto, ...(codeBarres !== undefined ? { codeBarres } : {}), syncVersion: { increment: 1 } },
      })
    );
  }

  /** PATCH /produits/:id/code-barres — la cafétaria associe le code d'un
   * article inconnu pendant la vente, sans pouvoir toucher au prix ni au
   * reste de la fiche (réservés au patron). */
  async associerCodeBarres(id: string, code: string | null, hotelId: string) {
    const actuel = await this.findOne(id, hotelId);
    const codeBarres = ProduitsService.normaliserCode(code) ?? null;
    if (codeBarres && actuel.typeProduit === "PLAT") {
      throw new BadRequestException("Un plat préparé n'a pas de code-barres : réservé aux articles de comptoir.");
    }
    return this.ecrireAvecCodeUnique(hotelId, codeBarres, () =>
      this.prisma.produit.update({ where: { id, hotelId }, data: { codeBarres, syncVersion: { increment: 1 } } })
    );
  }

  async remove(id: string, hotelId: string) {
    await this.findOne(id, hotelId);
    try {
      await this.prisma.$transaction([
        this.prisma.produit.delete({ where: { id, hotelId } }),
        // Pierre tombale : sans elle, les appareils hors ligne garderaient
        // l'élément supprimé indéfiniment (voir SyncService.pull).
        this.prisma.suppression.create({ data: { hotelId, entiteType: "Produit", entiteId: id } }),
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new ConflictException(
          "Impossible de supprimer ce produit : il a un historique de mouvements de stock ou de commandes. " +
            "Désactivez-le plutôt (actif = false)."
        );
      }
      throw error;
    }
  }
}
