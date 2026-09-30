import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@hotel-chicago/database";
import { PRISMA } from "../prisma/prisma.module";
import { SupabaseStorageService } from "../common/supabase-storage/supabase-storage.service";
import { verifierUrlsHotel } from "../common/supabase-storage/urls-hotel";
import { ModifierSiteDto } from "./dto/modifier-site.dto";

const RESEAUX_AUTORISES = ["facebook", "instagram", "tiktok", "youtube", "x"];

@Injectable()
export class HotelSiteService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly stockage: SupabaseStorageService
  ) {}

  /** Coordonnées (Hotel) + contenu (HotelSite), à plat — un seul objet à éditer. */
  async obtenir(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId }, include: { site: true } });
    if (!hotel) throw new NotFoundException("Hôtel introuvable.");
    return {
      nom: hotel.nom,
      sousDomaine: hotel.sousDomaine,
      adresse: hotel.adresse,
      telephoneContact: hotel.telephoneContact,
      emailContact: hotel.emailContact,
      slogan: hotel.site?.slogan ?? null,
      presentation: hotel.site?.presentation ?? null,
      couvertureUrl: hotel.site?.couvertureUrl ?? null,
      galerie: hotel.site?.galerie ?? [],
      services: hotel.site?.services ?? [],
      whatsapp: hotel.site?.whatsapp ?? null,
      horaireArrivee: hotel.site?.horaireArrivee ?? null,
      horaireDepart: hotel.site?.horaireDepart ?? null,
      reception24h: hotel.site?.reception24h ?? false,
      lienCarte: hotel.site?.lienCarte ?? null,
      reseaux: hotel.site?.reseaux ?? {},
    };
  }

  async modifier(hotelId: string, dto: ModifierSiteDto) {
    verifierUrlsHotel([dto.couvertureUrl, ...(dto.galerie ?? [])], hotelId);

    if (dto.reseaux) {
      for (const [cle, valeur] of Object.entries(dto.reseaux)) {
        if (!RESEAUX_AUTORISES.includes(cle)) throw new BadRequestException(`Réseau inconnu : ${cle}.`);
        if (valeur && !/^https?:\/\//i.test(valeur)) {
          throw new BadRequestException(`Le lien ${cle} doit commencer par http(s)://.`);
        }
      }
    }

    const avant = await this.prisma.hotelSite.findUnique({ where: { hotelId } });

    const coordonnees = {
      ...(dto.nom !== undefined && { nom: dto.nom }),
      ...(dto.adresse !== undefined && { adresse: dto.adresse }),
      ...(dto.telephoneContact !== undefined && { telephoneContact: dto.telephoneContact }),
      ...(dto.emailContact !== undefined && { emailContact: dto.emailContact }),
    };
    const contenu = {
      ...(dto.slogan !== undefined && { slogan: dto.slogan }),
      ...(dto.presentation !== undefined && { presentation: dto.presentation }),
      ...(dto.couvertureUrl !== undefined && { couvertureUrl: dto.couvertureUrl }),
      ...(dto.galerie !== undefined && { galerie: dto.galerie }),
      ...(dto.services !== undefined && { services: dto.services as any }),
      ...(dto.whatsapp !== undefined && { whatsapp: dto.whatsapp }),
      ...(dto.horaireArrivee !== undefined && { horaireArrivee: dto.horaireArrivee }),
      ...(dto.horaireDepart !== undefined && { horaireDepart: dto.horaireDepart }),
      ...(dto.reception24h !== undefined && { reception24h: dto.reception24h }),
      ...(dto.lienCarte !== undefined && { lienCarte: dto.lienCarte }),
      ...(dto.reseaux !== undefined && { reseaux: dto.reseaux as any }),
    };

    await this.prisma.$transaction([
      ...(Object.keys(coordonnees).length > 0
        ? [this.prisma.hotel.update({ where: { id: hotelId }, data: coordonnees })]
        : []),
      this.prisma.hotelSite.upsert({ where: { hotelId }, create: { hotelId, ...contenu }, update: contenu }),
    ]);

    // Nettoyage du stockage : images retirées du site. Après l'écriture, et
    // jamais bloquant (un fichier orphelin n'est pas une erreur pour le patron).
    const retirees = [
      ...(dto.couvertureUrl !== undefined && avant?.couvertureUrl && avant.couvertureUrl !== dto.couvertureUrl
        ? [avant.couvertureUrl]
        : []),
      ...(dto.galerie !== undefined ? (avant?.galerie ?? []).filter((u) => !dto.galerie!.includes(u)) : []),
    ];
    await Promise.all(retirees.map((u) => this.stockage.supprimerImage(hotelId, u)));

    return this.obtenir(hotelId);
  }
}
