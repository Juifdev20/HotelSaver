import { BadRequestException, ConflictException, UnauthorizedException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient, StatutLigne, TypeProduit } from "@hotel-chicago/database";
import { StatutChambre } from "@hotel-chicago/database";
import { CommandeWebCreee, Role, StatutSuiviPublic, SuiviReservationPublic, codeSuivi } from "@hotel-chicago/types";
import { NotificationsService } from "../notifications/notifications.service";
import { messages } from "../notifications/messages";
import { PRISMA } from "../prisma/prisma.module";
import { SupabaseAdminService } from "../common/supabase-admin/supabase-admin.service";
import { extraireCouleursLogo } from "../common/palette/extraire-couleurs-logo";
import { genererPalette } from "../common/palette/generer-palette";
import { CreerCommandeWebDto } from "./dto/creer-commande-web.dto";
import { CreerDemandeReservationDto } from "./dto/creer-demande-reservation.dto";
import { FindChambresDisponiblesQueryDto } from "./dto/find-chambres-disponibles.query.dto";
import { FindHotelPublicQueryDto } from "./dto/find-hotel-public.query.dto";
import { FindMenuQueryDto } from "./dto/find-menu.query.dto";
import { InscriptionHotelDto } from "./dto/inscription-hotel.dto";
import { MotDePasseOublieDto } from "./dto/mot-de-passe-oublie.dto";
import { ReinitialiserMotDePasseDto } from "./dto/reinitialiser-mot-de-passe.dto";
import { FindTicketCommandeQueryDto } from "./dto/find-ticket-commande.query.dto";
import { rendreTicketCommandeWeb } from "./ticket-commande";
import { AnnulerReservationPubliqueDto, PreEnregistrementDto, SuiviReservationQueryDto } from "./dto/suivi-reservation.dto";

/** Préfixe du motif d'une annulation faite par le client depuis sa page de
 * suivi — distingue « Annulée » (par le client) de « Non retenue » (par
 * l'hôtel, motif interne jamais montré au client). */
const MOTIF_ANNULATION_CLIENT = "Annulée par le client depuis le site";

/** Réservations qui bloquent réellement une chambre (voir ReservationsService —
 * dupliqué ici volontairement : ce service public ne doit dépendre d'aucun
 * état interne du module Réservations, juste de la base). */
const STATUTS_OCCUPANTS = ["CONFIRMEE", "EN_COURS"] as const;

/** Utilisateur.id n'existe pas pour un visiteur anonyme du site public ; comme
 * Reservation.createdBy est un simple champ String (pas une relation Prisma
 * vers Utilisateur), cette valeur sentinelle documente l'origine sans avoir
 * besoin de rendre la colonne nullable ni de créer un utilisateur factice. */
const CREATED_BY_SITE_PUBLIC = "SITE_PUBLIC";

/** Sous-domaines interdits à l'inscription libre-service. */
const SOUS_DOMAINES_RESERVES = new Set([
  "www", "api", "app", "admin", "administrator", "super-admin", "superadmin", "root", "mail", "email", "smtp", "ftp", "support", "help",
  "aide", "billing", "paiement", "payment", "login", "connexion", "auth", "secure", "securite", "status", "cdn", "static", "assets",
  "hotelsaver", "hotel-saver", "dashboard", "console", "test", "demo", "staging", "dev", "prod", "blog", "docs",
]);

/** Ce que le site public a le droit de voir : jamais hotelId, prix d'achat, stock, seuil, code-barres, version de synchro. */
const CHAMPS_CHAMBRE_PUBLICS = { id: true, numero: true, type: true, prixParNuit: true, devise: true, photos: true } as const;
const CHAMPS_PRODUIT_PUBLICS = {
  id: true,
  nom: true,
  categorie: true,
  prix: true,
  devise: true,
  typeProduit: true,
  photo: true,
  description: true,
  portionsDisponibles: true,
} as const;

@Injectable()
export class PublicService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly notifications: NotificationsService
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
      commandeWebActivee: hotel.commandeWebActivee,
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

  /**
   * « Mot de passe oublié » : e-mail de récupération Supabase, dont le lien
   * ramène sur la page de réinitialisation du site. Réponse identique que le
   * compte existe ou non.
   */
  async demanderReinitialisation(dto: MotDePasseOublieDto): Promise<{ ok: true }> {
    const site = process.env.SITE_WEB_URL ?? "http://localhost:5175";
    await this.supabaseAdmin.envoyerRecuperation(dto.email.trim().toLowerCase(), `${site}/reinitialiser-mot-de-passe`);
    return { ok: true };
  }

  /** Fixe le nouveau mot de passe du détenteur du jeton de récupération. */
  async reinitialiserMotDePasse(dto: ReinitialiserMotDePasseDto): Promise<{ ok: true }> {
    const id = await this.supabaseAdmin.idDepuisJeton(dto.jeton);
    if (!id) {
      throw new UnauthorizedException("Ce lien a expiré ou n'est plus valide. Refaites une demande de réinitialisation.");
    }
    await this.supabaseAdmin.mettreAJourCompte(id, { motDePasse: dto.motDePasse });
    return { ok: true };
  }

  async findChambresDisponibles(query: FindChambresDisponiblesQueryDto) {
    const { id: hotelId } = await this.resoudreHotel(query.sousDomaine);

    if (!query.dateArrivee || !query.dateDepart) {
      return this.prisma.chambre.findMany({ where: { hotelId, statut: StatutChambre.LIBRE }, select: CHAMPS_CHAMBRE_PUBLICS, orderBy: { numero: "asc" } });
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
      select: CHAMPS_CHAMBRE_PUBLICS,
      orderBy: { numero: "asc" },
    });
  }

  /**
   * Carte publique — seuls les produits que le patron a explicitement marqués
   * `commandableEnLigne` sont exposés (opt-in : rien n'est publié par défaut).
   * `portionsDisponibles` permet au site de marquer « Épuisé » un plat à
   * portions limitées (null = illimité).
   */
  async findMenu(query: FindMenuQueryDto) {
    const { id: hotelId } = await this.resoudreHotel(query.sousDomaine);
    // Carte du restaurant : uniquement les PLATS (les articles de comptoir —
    // bière, sucre… — ne sont pas un « menu » et n'ont pas vocation à être
    // commandés en ligne).
    return this.prisma.produit.findMany({
      where: { hotelId, actif: true, commandableEnLigne: true, typeProduit: "PLAT" },
      select: CHAMPS_PRODUIT_PUBLICS,
      orderBy: [{ categorie: "asc" }, { nom: "asc" }],
    });
  }

  /**
   * POST /public/commande — un visiteur anonyme commande depuis la page
   * « Cuisine » du site. La commande devient un CompteCafeteria ordinaire
   * (origine SITE_PUBLIC) : paiement au comptoir, reçu et suivi de préparation
   * passent ensuite par les flux cafétéria existants.
   *
   * Règles propres au canal public :
   * - l'hôtel doit avoir activé `commandeWebActivee` (404 uniforme sinon) ;
   * - chaque produit doit être `actif`, `commandableEnLigne` ET de type PLAT
   *   pour CET hôtel (les articles de comptoir ne sont pas commandables) ;
   * - les prix sont repris en base, jamais depuis le payload client ;
   * - un plat n'a pas de stock compté (on cuisine à la commande) ; s'il a des
   *   `portionsDisponibles` limitées elles sont vérifiées puis décrémentées
   *   (remontées si la commande échoue ensuite) ;
   * - statut des lignes : EN_ATTENTE si la cuisine interne est active, SERVI
   *   sinon (même règle que CafeteriaService.ajouterLigne).
   */
  async creerCommandeWeb(dto: CreerCommandeWebDto): Promise<CommandeWebCreee> {
    const hotel = await this.resoudreHotel(dto.sousDomaine);
    if (!hotel.commandeWebActivee) {
      throw new NotFoundException(`Aucun hôtel disponible pour "${dto.sousDomaine}".`);
    }
    const hotelId = hotel.id;

    // Agrégation par produit pour le total (un même produit peut figurer sur
    // plusieurs lignes avec des notes différentes).
    const quantites = new Map<string, number>();
    for (const ligne of dto.lignes) {
      quantites.set(ligne.produitId, (quantites.get(ligne.produitId) ?? 0) + ligne.quantite);
    }

    const produits = await this.prisma.produit.findMany({
      where: {
        hotelId,
        id: { in: [...quantites.keys()] },
        actif: true,
        commandableEnLigne: true,
        typeProduit: TypeProduit.PLAT,
      },
    });
    const parId = new Map(produits.map((p) => [p.id, p]));
    for (const produitId of quantites.keys()) {
      if (!parId.has(produitId)) {
        throw new BadRequestException("Un des articles commandés n'est plus disponible à la commande en ligne.");
      }
    }

    const contactClient =
      [dto.client.telephone, dto.client.chambre ? `ch. ${dto.client.chambre}` : null].filter(Boolean).join(" · ") ||
      null;
    const compte = await this.prisma.compteCafeteria.create({
      data: {
        hotelId,
        tableOuNom: `Commande web — ${dto.client.nom}`,
        origine: "SITE_PUBLIC",
        contactClient,
        noteClient: dto.client.note ?? null,
        ouvertPar: CREATED_BY_SITE_PUBLIC,
        sousComptes: { create: [{ hotelId, nom: dto.client.nom }] },
      },
      include: { sousComptes: true },
    });
    const sousCompteId = compte.sousComptes[0]!.id;

    const statutLigne = hotel.cuisineActivee ? StatutLigne.EN_ATTENTE : StatutLigne.SERVI;
    // Plats à portions limitées déjà décrémentés — à remonter si la suite
    // échoue (pas de transaction interactive via le pooler).
    const portionsDecrementees: { produitId: string; quantite: number }[] = [];
    try {
      for (const [produitId, quantite] of quantites) {
        const produit = parId.get(produitId)!;
        if (produit.portionsDisponibles != null) {
          const { count } = await this.prisma.produit.updateMany({
            where: { id: produitId, hotelId, portionsDisponibles: { gte: quantite } },
            data: { portionsDisponibles: { decrement: quantite } },
          });
          if (count === 0) {
            throw new BadRequestException(`"${produit.nom}" n'est plus disponible en quantité suffisante.`);
          }
          portionsDecrementees.push({ produitId, quantite });
        }
      }
      for (const ligne of dto.lignes) {
        const produit = parId.get(ligne.produitId)!;
        await this.prisma.ligneCommande.create({
          data: {
            hotelId,
            sousCompteId,
            produitId: ligne.produitId,
            quantite: ligne.quantite,
            prixUnitaire: produit.prix,
            devise: produit.devise,
            statut: statutLigne,
            note: ligne.note ?? null,
          },
        });
      }
    } catch (erreur) {
      // Défaire proprement : remonter les portions déjà décrémentées puis
      // supprimer la commande partielle (lignes → sous-compte → compte) plutôt
      // que de laisser un compte fantôme au comptoir.
      for (const { produitId, quantite } of portionsDecrementees) {
        await this.prisma.produit
          .updateMany({ where: { id: produitId, hotelId }, data: { portionsDisponibles: { increment: quantite } } })
          .catch(() => undefined);
      }
      await this.annulerCommandeWebPartielle(hotelId, compte.id).catch(() => undefined);
      throw erreur;
    }

    let totalUSD = 0;
    let totalCDF = 0;
    for (const [produitId, quantite] of quantites) {
      const produit = parId.get(produitId)!;
      if (produit.devise === "USD") totalUSD += Number(produit.prix) * quantite;
      else totalCDF += Number(produit.prix) * quantite;
    }
    const nbArticles = dto.lignes.reduce((somme, l) => somme + l.quantite, 0);

    // La cafétéria (et le patron) de CET hôtel sont prévenus tout de suite.
    void this.notifications.emettre({
      hotelId,
      roles: [Role.CAFETARIA, Role.PATRON],
      ...messages.commandeWeb({
        client: dto.client.nom,
        articles: nbArticles,
        totalUSD,
        totalCDF,
        compteId: compte.id,
      }),
    });

    return { compteId: compte.id, reference: compte.id.slice(0, 8).toUpperCase(), totalUSD, totalCDF };
  }

  /**
   * Ticket PDF téléchargeable depuis l'écran de confirmation. Endpoint public
   * (le client n'a pas de compte) mais restreint aux commandes SITE_PUBLIC
   * de l'hôtel concerné : connaître l'UUID complet d'une commande reste
   * invraisemblable à deviner, et un compte de comptoir ne doit jamais être
   * exposé ici.
   */
  async genererTicketCommandeWeb(compteId: string, query: FindTicketCommandeQueryDto): Promise<Buffer> {
    const hotel = await this.resoudreHotel(query.sousDomaine);
    const compte = await this.prisma.compteCafeteria.findFirst({
      where: { id: compteId, hotelId: hotel.id, origine: "SITE_PUBLIC" },
      include: { sousComptes: { include: { lignes: { include: { produit: true } } } } },
    });
    if (!compte) {
      throw new NotFoundException("Aucune commande trouvée pour cette référence.");
    }
    let totalUSD = 0;
    let totalCDF = 0;
    const lignes = compte.sousComptes.flatMap((sc) =>
      sc.lignes.map((l) => {
        const montantLigne = Number(l.prixUnitaire) * Number(l.quantite);
        if (l.devise === "USD") totalUSD += montantLigne;
        else totalCDF += montantLigne;
        return {
          quantite: Number(l.quantite),
          nom: l.produit.nom,
          prixUnitaire: Number(l.prixUnitaire),
          devise: l.devise as "USD" | "CDF",
        };
      })
    );
    return rendreTicketCommandeWeb(
      {
        reference: compte.id.slice(0, 8).toUpperCase(),
        nomClient: compte.tableOuNom.replace(/^Commande web — /, ""),
        contactClient: compte.contactClient,
        noteClient: compte.noteClient,
        dateCommande: compte.ouvertLe,
        lignes,
        totalUSD,
        totalCDF,
      },
      { nom: hotel.nom, adresse: hotel.adresse, telephone: hotel.telephoneContact }
    );
  }

  /**
   * Compensation si `creerCommandeWeb` échoue après la création du compte (pas
   * de transaction interactive possible via le pooler, même raisonnement que
   * CafeteriaService.ajouterLigne) : lignes, sous-compte et compte supprimés.
   * Les plats n'ayant pas de stock compté, il n'y a rien à remonter.
   */
  private async annulerCommandeWebPartielle(hotelId: string, compteId: string): Promise<void> {
    const lignes = await this.prisma.ligneCommande.findMany({ where: { hotelId, sousCompte: { compteId } }, select: { id: true } });
    await this.prisma.ligneCommande.deleteMany({ where: { id: { in: lignes.map((l) => l.id) } } });
    await this.prisma.sousCompte.deleteMany({ where: { compteId } });
    await this.prisma.compteCafeteria.delete({ where: { id: compteId } });
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

    // Jamais de fusion avec une fiche existante depuis le canal public : n'importe qui peut taper le téléphone d'un vrai client et
    // se rattacher à sa fiche (nom, pièce d'identité visibles sur la page de suivi, fiche écrasée au pré-enregistrement).
    // La réception rapproche les doublons à la main.
    const client = await this.prisma.client.create({ data: { ...dto.client, hotelId } });

    const reservation = await this.prisma.reservation.create({
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

    // La réception (et le patron) de CET hôtel sont prévenus tout de suite : une demande non vue est un client perdu.
    void this.notifications.emettre({
      hotelId,
      roles: [Role.RECEPTIONNISTE, Role.PATRON],
      ...messages.demandeReservation({
        client: reservation.client?.nom ?? "Client",
        chambre: reservation.chambre?.numero ?? "?",
        arrivee: reservation.dateArrivee,
        depart: reservation.dateDepart,
        reservationId: reservation.id,
      }),
    });
    // Jamais la réservation complète (elle contient la fiche client) : le site
    // n'a besoin que du jeton pour ouvrir la page « Ma réservation ».
    return { id: reservation.id, statut: reservation.statut, jetonSuivi: reservation.jetonSuivi };
  }

  /** Réservation désignée par son jeton de suivi, dans l'hôtel du site
   * consulté — 404 uniforme sinon (jeton inconnu, autre hôtel, hôtel suspendu). */
  private async reservationParJeton(jeton: string, sousDomaine: string) {
    const hotel = await this.resoudreHotel(sousDomaine);
    const reservation = await this.prisma.reservation.findFirst({
      where: { jetonSuivi: jeton, hotelId: hotel.id },
      include: { chambre: true, client: true },
    });
    if (!reservation) throw new NotFoundException("Réservation introuvable.");
    return { hotel, reservation };
  }

  /** Annulable / pré-enregistrable : demande ou réservation confirmée, jusqu'à
   * la fin du jour d'arrivée (le client peut encore prévenir le jour même). */
  private static modifiableParClient(r: { statut: string; dateArrivee: Date }, maintenant = new Date()): boolean {
    return (r.statut === "EN_ATTENTE" || r.statut === "CONFIRMEE") && maintenant.getTime() < r.dateArrivee.getTime() + 24 * 3600_000;
  }

  /**
   * Page « Ma réservation » du site (07/10/2026). Réponse réduite à ce que le
   * client doit voir : jamais le numéro de pièce (seulement « renseignée »),
   * jamais le motif interne d'une annulation par l'hôtel.
   */
  async obtenirSuiviReservation(jeton: string, query: SuiviReservationQueryDto): Promise<SuiviReservationPublic> {
    const { hotel, reservation: r } = await this.reservationParJeton(jeton, query.sousDomaine);
    const site = await this.prisma.hotelSite.findUnique({ where: { hotelId: hotel.id }, select: { whatsapp: true } });
    const nuits = Math.max(1, Math.round((r.dateDepart.getTime() - r.dateArrivee.getTime()) / 86_400_000));
    const statut: StatutSuiviPublic =
      r.statut === "ANNULEE"
        ? r.motifAnnulation?.startsWith(MOTIF_ANNULATION_CLIENT)
          ? "ANNULEE"
          : "NON_RETENUE"
        : (r.statut as StatutSuiviPublic);
    const modifiable = PublicService.modifiableParClient(r);
    return {
      code: codeSuivi(r.jetonSuivi),
      statut,
      hotel: { nom: hotel.nom, whatsapp: site?.whatsapp ?? null, telephone: hotel.telephoneContact ?? null },
      client: { nom: r.client.nom },
      chambre: { numero: r.chambre.numero, type: r.chambre.type },
      dateArrivee: r.dateArrivee.toISOString(),
      dateDepart: r.dateDepart.toISOString(),
      nuits,
      totalEstime: String(Math.round(Number(r.chambre.prixParNuit) * nuits * 100) / 100),
      acompte: String(r.acompte),
      devise: r.chambre.devise as SuiviReservationPublic["devise"],
      preEnregistrement: {
        fait: r.preEnregistreLe !== null,
        le: r.preEnregistreLe?.toISOString() ?? null,
        heureArriveePrevue: r.heureArriveePrevue,
        demandeClient: r.demandeClient,
        pieceRenseignee: Boolean(r.client.typePiece && r.client.numeroPiece),
      },
      reponseReception: r.reponseReception,
      peutAnnuler: modifiable,
      peutPreEnregistrer: modifiable,
    };
  }

  /** Le client annule lui-même depuis sa page de suivi ; la réception et le
   * patron sont prévenus. Même écriture que ReservationsService.annuler
   * (statut, annuleLe, motif, syncVersion+1), dupliquée volontairement : ce
   * service public ne dépend pas du module Réservations. */
  async annulerReservationPublique(jeton: string, query: SuiviReservationQueryDto, dto: AnnulerReservationPubliqueDto) {
    const { hotel, reservation } = await this.reservationParJeton(jeton, query.sousDomaine);
    if (!PublicService.modifiableParClient(reservation)) {
      throw new ConflictException("Cette réservation ne peut plus être annulée en ligne. Contactez l'hôtel.");
    }
    const precision = dto.motif?.trim();
    const motif = precision ? `${MOTIF_ANNULATION_CLIENT} : ${precision}` : MOTIF_ANNULATION_CLIENT;
    await this.prisma.reservation.update({
      where: { id: reservation.id },
      data: { statut: "ANNULEE", annuleLe: new Date(), motifAnnulation: motif, syncVersion: { increment: 1 } },
    });
    void this.notifications.emettre({
      hotelId: hotel.id,
      roles: [Role.RECEPTIONNISTE, Role.PATRON],
      ...messages.reservationAnnulee({
        client: reservation.client.nom,
        chambre: reservation.chambre.numero,
        motif,
        reservationId: reservation.id,
        par: "le client (site web)",
      }),
    });
    return this.obtenirSuiviReservation(jeton, query);
  }

  /** Pré-enregistrement en ligne : la pièce va sur la fiche Client, l'heure
   * et la demande sur la Reservation (syncVersion+1 des deux, pour que les
   * téléphones de la réception les reçoivent). Peut être refait tant que la
   * réservation reste modifiable. */
  async preEnregistrer(jeton: string, query: SuiviReservationQueryDto, dto: PreEnregistrementDto) {
    const { hotel, reservation } = await this.reservationParJeton(jeton, query.sousDomaine);
    if (!PublicService.modifiableParClient(reservation)) {
      throw new ConflictException("Le pré-enregistrement n'est plus possible pour cette réservation. Contactez l'hôtel.");
    }
    const demande = dto.demandeClient?.trim() || null;
    await this.prisma.$transaction([
      this.prisma.client.update({
        where: { id: reservation.clientId },
        data: {
          typePiece: dto.typePiece,
          numeroPiece: dto.numeroPiece.trim(),
          ...(dto.email ? { email: dto.email.trim() } : {}),
          ...(dto.telephone ? { telephone: dto.telephone.trim() } : {}),
          syncVersion: { increment: 1 },
        },
      }),
      this.prisma.reservation.update({
        where: { id: reservation.id },
        data: {
          heureArriveePrevue: dto.heureArriveePrevue,
          demandeClient: demande,
          preEnregistreLe: new Date(),
          syncVersion: { increment: 1 },
        },
      }),
    ]);
    void this.notifications.emettre({
      hotelId: hotel.id,
      roles: [Role.RECEPTIONNISTE, Role.PATRON],
      ...messages.preEnregistrement({
        client: reservation.client.nom,
        chambre: reservation.chambre.numero,
        arrivee: reservation.dateArrivee,
        heure: dto.heureArriveePrevue,
        reservationId: reservation.id,
      }),
    });
    return this.obtenirSuiviReservation(jeton, query);
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
    // Noms réservés : un inconnu ne doit pas pouvoir prendre « admin » ou « api » (hameçonnage, confusion avec nos propres adresses).
    if (SOUS_DOMAINES_RESERVES.has(dto.sousDomaine) || dto.sousDomaine.length < 3 || dto.sousDomaine.startsWith("-") || dto.sousDomaine.endsWith("-")) {
      throw new BadRequestException("Ce sous-domaine n'est pas disponible. Choisissez-en un autre (3 caractères minimum).");
    }
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
