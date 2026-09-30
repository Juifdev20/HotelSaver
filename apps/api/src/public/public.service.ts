import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@hotel-chicago/database";
import { StatutChambre } from "@hotel-chicago/database";
import { PRISMA } from "../prisma/prisma.module";
import { SupabaseAdminService } from "../common/supabase-admin/supabase-admin.service";
import { extraireCouleursLogo } from "../common/palette/extraire-couleurs-logo";
import { genererPalette } from "../common/palette/generer-palette";
import { CreerDemandeReservationDto } from "./dto/creer-demande-reservation.dto";
import { FindChambresDisponiblesQueryDto } from "./dto/find-chambres-disponibles.query.dto";
import { FindHotelPublicQueryDto } from "./dto/find-hotel-public.query.dto";
import { FindMenuQueryDto } from "./dto/find-menu.query.dto";
import { InscriptionHotelDto } from "./dto/inscription-hotel.dto";

/** Réservations qui bloquent réellement une chambre (voir ReservationsService —
 * dupliqué ici volontairement : ce service public ne doit dépendre d'aucun
 * état interne du module Réservations, juste de la base). */
const STATUTS_OCCUPANTS = ["CONFIRMEE", "EN_COURS"] as const;

/** Utilisateur.id n'existe pas pour un visiteur anonyme du site public ; comme
 * Reservation.createdBy est un simple champ String (pas une relation Prisma
 * vers Utilisateur), cette valeur sentinelle documente l'origine sans avoir
 * besoin de rendre la colonne nullable ni de créer un utilisateur factice. */
const CREATED_BY_SITE_PUBLIC = "SITE_PUBLIC";

@Injectable()
export class PublicService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly supabaseAdmin: SupabaseAdminService
  ) {}

  /**
   * `identifiant` couvre trois formes possibles envoyées par `apps/web`
   * (Phase 9, étendu Phase 13) : un sous-domaine nu (`chicago`, via `?hotel=`
   * ou déjà résolu), un nom d'hôte complet de sous-domaine HotelSaver
   * (`chicago.hotelsaver.com`/`chicago.localhost` — premier label repris en
   * secours) ou un domaine personnalisé complet (`www.hotel-chicago.com`,
   * Phase 13). Un seul `OR` couvre les trois sans que le client ait besoin
   * de connaître le domaine de base final de la plateforme (toujours pas
   * choisi, voir DECISIONS.md Phase 9).
   */
  private construireFiltreHote(identifiant: string): Prisma.HotelWhereInput {
    const premierLabel = identifiant.split(".")[0];
    const conditions: Prisma.HotelWhereInput[] = [
      { domainePersonnalise: identifiant },
      { sousDomaine: identifiant },
    ];
    if (premierLabel !== identifiant) conditions.push({ sousDomaine: premierLabel });
    return { OR: conditions };
  }

  /**
   * Résolution de tenant (Phases 9 et 13) — le visiteur anonyme n'a pas de
   * JWT (voir public.controller.ts), donc pas de `hotelId` à en tirer comme
   * partout ailleurs (Phase 2) : `apps/web` détermine son propre nom d'hôte
   * et le transmet explicitement à chaque appel, jamais déduit d'un en-tête
   * côté serveur. 404 uniforme si l'hôte est inconnu OU si l'hôtel est
   * SUSPENDU/RESILIE (même raisonnement que SupabaseAuthGuard, Phase 4) : ne
   * pas révéler qu'un hôte existe mais est suspendu.
   */
  private async resoudreHotel(identifiant: string) {
    const hotel = await this.prisma.hotel.findFirst({ where: this.construireFiltreHote(identifiant) });
    if (!hotel || hotel.statutLicence === "SUSPENDU" || hotel.statutLicence === "RESILIE") {
      throw new NotFoundException(`Aucun hôtel disponible pour "${identifiant}".`);
    }
    return hotel;
  }

  /**
   * Charte graphique publique d'un hôtel (Phase 11) — réponse volontairement
   * minimale : ni `statutLicence`, ni `emailContact`, etc., qui n'ont rien à
   * faire côté public. Réutilise le même 404 uniforme que `resoudreHotel`.
   */
  async obtenirInfoPublique(query: FindHotelPublicQueryDto) {
    const hotel = await this.prisma.hotel.findFirst({
      where: this.construireFiltreHote(query.sousDomaine),
      include: { branding: true, site: true },
    });
    if (!hotel || hotel.statutLicence === "SUSPENDU" || hotel.statutLicence === "RESILIE") {
      throw new NotFoundException(`Aucun hôtel disponible pour "${query.sousDomaine}".`);
    }
    const site = hotel.site;
    return {
      nom: hotel.nom,
      // Coordonnées et contenu définis par le patron (HotelSite) : publics par
      // nature, c'est la vitrine de l'hôtel. Jamais de donnée de licence ici.
      adresse: hotel.adresse ?? null,
      telephoneContact: hotel.telephoneContact ?? null,
      emailContact: hotel.emailContact ?? null,
      slogan: site?.slogan ?? null,
      presentation: site?.presentation ?? null,
      couvertureUrl: site?.couvertureUrl ?? null,
      galerie: site?.galerie ?? [],
      services: site?.services ?? [],
      whatsapp: site?.whatsapp ?? null,
      horaireArrivee: site?.horaireArrivee ?? null,
      horaireDepart: site?.horaireDepart ?? null,
      reception24h: site?.reception24h ?? false,
      lienCarte: site?.lienCarte ?? null,
      reseaux: site?.reseaux ?? {},
      logoUrl: hotel.branding?.logoUrl ?? null,
      policeAffichage: hotel.branding?.policeAffichage ?? "Fraunces",
      policeCorps: hotel.branding?.policeCorps ?? "Public Sans",
      policeMono: hotel.branding?.policeMono ?? "IBM Plex Mono",
      palette: hotel.branding?.palette ?? null,
    };
  }

  /**
   * Vitrine de la page d'accueil : hôtels clients de la plateforme. Seuls les
   * hôtels `ACTIF` (abonnement payé) apparaissent — un hôtel en `ESSAI` n'a
   * pas encore choisi d'être montré publiquement. Champs minimaux, jamais de
   * contact ni de données de licence.
   */
  async listerHotelsPartenaires() {
    const hotels = await this.prisma.hotel.findMany({
      where: { statutLicence: "ACTIF" },
      include: { branding: true },
      orderBy: { createdAt: "asc" },
      take: 24,
    });
    return hotels.map((h) => {
      const palette = h.branding?.palette as { light?: { bleu?: string } } | null | undefined;
      return {
        nom: h.nom,
        sousDomaine: h.sousDomaine,
        logoUrl: h.branding?.logoUrl ?? null,
        adresse: h.adresse ?? null,
        couleur: palette?.light?.bleu ?? null,
      };
    });
  }

  async findChambresDisponibles(query: FindChambresDisponiblesQueryDto) {
    const { id: hotelId } = await this.resoudreHotel(query.sousDomaine);

    if (!query.dateArrivee || !query.dateDepart) {
      return this.prisma.chambre.findMany({ where: { hotelId, statut: StatutChambre.LIBRE }, orderBy: { numero: "asc" } });
    }

    const dateArrivee = new Date(query.dateArrivee);
    const dateDepart = new Date(query.dateDepart);
    if (dateArrivee >= dateDepart) {
      throw new BadRequestException("La date de départ doit être postérieure à la date d'arrivée.");
    }

    const chambresOccupees = await this.prisma.reservation.findMany({
      where: {
        hotelId,
        statut: { in: [...STATUTS_OCCUPANTS] },
        dateArrivee: { lt: dateDepart },
        dateDepart: { gt: dateArrivee },
      },
      select: { chambreId: true },
    });
    const idsOccupees = chambresOccupees.map((r) => r.chambreId);

    return this.prisma.chambre.findMany({
      where: { hotelId, id: { notIn: idsOccupees } },
      orderBy: { numero: "asc" },
    });
  }

  async findMenu(query: FindMenuQueryDto) {
    const { id: hotelId } = await this.resoudreHotel(query.sousDomaine);
    return this.prisma.produit.findMany({
      where: { hotelId, actif: true },
      orderBy: [{ categorie: "asc" }, { nom: "asc" }],
    });
  }

  async creerDemandeReservation(dto: CreerDemandeReservationDto) {
    const { id: hotelId } = await this.resoudreHotel(dto.sousDomaine);

    const chambre = await this.prisma.chambre.findUnique({ where: { id: dto.chambreId, hotelId } });
    if (!chambre) {
      throw new NotFoundException(`Aucune chambre trouvée avec l'identifiant ${dto.chambreId}.`);
    }

    const dateArrivee = new Date(dto.dateArrivee);
    const dateDepart = new Date(dto.dateDepart);
    if (dateArrivee >= dateDepart) {
      throw new BadRequestException("La date de départ doit être postérieure à la date d'arrivée.");
    }

    // Une demande EN_ATTENTE n'occupe pas la chambre (voir ReservationsService) :
    // plusieurs demandes peuvent chevaucher la même période, à arbitrer par la
    // réception. Pas de vérification de conflit ici, volontairement.

    const client = dto.client.telephone
      ? ((await this.prisma.client.findFirst({ where: { hotelId, telephone: dto.client.telephone } })) ??
          (await this.prisma.client.create({ data: { ...dto.client, hotelId } })))
      : await this.prisma.client.create({ data: { ...dto.client, hotelId } });

    return this.prisma.reservation.create({
      data: {
        hotelId,
        chambreId: dto.chambreId,
        clientId: client.id,
        dateArrivee,
        dateDepart,
        statut: "EN_ATTENTE",
        origine: "SITE_PUBLIC",
        createdBy: CREATED_BY_SITE_PUBLIC,
      },
      include: { chambre: true, client: true },
    });
  }

  /**
   * Inscription en libre-service (section 3 du document de séquencement
   * HotelSaver) — toujours statutLicence = ESSAI, jamais ACTIF (ça, c'est le
   * chemin manuel du Super-Admin, Phase 3). Contrairement à ce chemin manuel
   * (deux étapes volontairement séparées : POST /super-admin/hotels puis
   * creer-utilisateur.js), ici tout doit fonctionner en un seul geste — le
   * propriétaire n'a personne pour créer son premier compte à sa place.
   */
  async inscrireHotel(dto: InscriptionHotelDto) {
    const compteAuth = await this.supabaseAdmin.creerCompte({ email: dto.email, motDePasse: dto.motDePasse });
    // Un logo mal formé ne doit jamais faire échouer l'inscription :
    // extraireCouleursLogo ne lève jamais, renvoie null au moindre souci
    // (Phase 5) — genererPalette(null) retombe sur PALETTE_DEFAUT.
    const couleurBase = dto.logoUrl ? await extraireCouleursLogo(dto.logoUrl) : null;
    const palette = genererPalette(couleurBase);

    try {
      return await this.prisma.hotel.create({
        data: {
          nom: dto.nom,
          sousDomaine: dto.sousDomaine,
          statutLicence: "ESSAI",
          telephoneContact: dto.telephoneContact,
          adresse: dto.adresse,
          emailContact: dto.email,
          branding: { create: { palette, logoUrl: dto.logoUrl } },
          utilisateurs: {
            create: [{ nom: dto.nomProprietaire, role: "PATRON", actif: true, supabaseAuthId: compteAuth.id }],
          },
        },
        include: { branding: true },
      });
    } catch (error) {
      // Jamais laisser un compte Supabase orphelin (ex. sousDomaine déjà pris) —
      // même principe que les scripts CLI (creer-utilisateur.js).
      await this.supabaseAdmin.supprimerCompte(compteAuth.id);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(`Un hôtel avec le sous-domaine "${dto.sousDomaine}" existe déjà.`);
      }
      throw error;
    }
  }
}
