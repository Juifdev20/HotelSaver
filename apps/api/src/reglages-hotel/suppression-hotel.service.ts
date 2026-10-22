import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@hotel-chicago/database";
import { PRISMA } from "../prisma/prisma.module";
import { NettoyageEssaisService } from "../super-admin/nettoyage-essais.service";
import type { RaisonSuppression } from "./dto/supprimer-hotel.dto";

const LIBELLES: Record<RaisonSuppression, string> = {
  plus_utilise: "N'utilise plus HotelSaver",
  trop_cher: "Trop cher",
  probleme_technique: "Problèmes techniques",
  hotel_ferme: "L'hôtel a fermé ou changé de propriétaire",
  autre_logiciel: "Passe à un autre logiciel",
  autre: "Autre raison",
};

const normaliser = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Le PATRON supprime son compte, donc son hôtel et tout ce qui lui appartient (22/10/2026, exigence Google Play). Depuis le site
 * (« Supprimer mon compte » de l'application l'ouvre) : la raison du départ, puis le nom de l'hôtel retapé. Les employés
 * (réception, cafétéria) ne peuvent pas : leur compte appartient à l'hôtel, c'est le patron qui les retire.
 *
 * Refusé tant qu'un client est dans l'hôtel, qu'une réservation est à venir ou qu'un remboursement d'acompte reste à faire : des
 * gens comptent encore sur l'hôtel. La suppression elle-même est celle des essais abandonnés (NettoyageEssaisService.supprimerHotel) :
 * fichiers, puis toute la base en une transaction, puis les comptes de connexion ; la raison est gardée dans HotelSupprime.
 */
@Injectable()
export class SuppressionHotelService {
  private readonly logger = new Logger(SuppressionHotelService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly nettoyage: NettoyageEssaisService
  ) {}

  /** Ce qui empêche encore la suppression, dans l'ordre où s'en occuper. Vide = possible maintenant. */
  async obstacles(hotelId: string, maintenant = new Date()): Promise<string[]> {
    const obstacles: string[] = [];
    const enCours = await this.prisma.reservation.count({ where: { hotelId, statut: "EN_COURS" } });
    if (enCours) obstacles.push(`${enCours} client${enCours > 1 ? "s sont" : " est"} encore dans l'hôtel : faites d'abord leur départ.`);
    const aVenir = await this.prisma.reservation.count({ where: { hotelId, statut: { in: ["EN_ATTENTE", "CONFIRMEE"] }, dateDepart: { gte: maintenant } } });
    if (aVenir) obstacles.push(`${aVenir} réservation${aVenir > 1 ? "s sont" : " est"} à venir : annulez-${aVenir > 1 ? "les" : "la"} d'abord (et prévenez les clients).`);
    const remboursements = await this.prisma.remboursement.count({ where: { hotelId, statut: "A_FAIRE" } });
    if (remboursements) obstacles.push(`${remboursements} remboursement${remboursements > 1 ? "s" : ""} d'acompte reste${remboursements > 1 ? "nt" : ""} à faire.`);
    return obstacles;
  }

  async etat(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId }, select: { nom: true } });
    if (!hotel) throw new NotFoundException("Hôtel introuvable.");
    return { hotelNom: hotel.nom, obstacles: await this.obstacles(hotelId) };
  }

  async supprimer(hotelId: string, patronNom: string, demande: { raison: RaisonSuppression; commentaire?: string; confirmationNom: string }) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, nom: true, sousDomaine: true, createdAt: true } });
    if (!hotel) throw new NotFoundException("Hôtel introuvable.");
    if (normaliser(demande.confirmationNom) !== normaliser(hotel.nom)) {
      throw new BadRequestException(`Le nom ne correspond pas : tapez exactement « ${hotel.nom} ».`);
    }
    const obstacles = await this.obstacles(hotelId);
    if (obstacles.length) throw new ForbiddenException({ statusCode: 403, code: "SUPPRESSION_BLOQUEE", message: obstacles[0], obstacles });

    const commentaire = demande.commentaire?.trim().slice(0, 1000);
    const motif = `Supprimé par le patron (${patronNom}) — ${LIBELLES[demande.raison]}${commentaire ? ` — « ${commentaire} »` : ""}`;
    await this.nettoyage.supprimerHotel(hotel, motif);
    this.logger.log(`Hôtel ${hotel.id} (${hotel.sousDomaine}) supprimé par son patron : ${demande.raison}`);
    return { supprime: true };
  }
}
