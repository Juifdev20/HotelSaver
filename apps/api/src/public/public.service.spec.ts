jest.mock("../common/palette/extraire-couleurs-logo");

import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@hotel-chicago/database";
import { PublicService } from "./public.service";
import { PALETTE_DEFAUT } from "../common/palette-defaut";
import { extraireCouleursLogo } from "../common/palette/extraire-couleurs-logo";

const HOTEL_ID = "hotel-1";

function creerPrismaMock() {
  return {
    hotel: {
      findFirst: jest.fn().mockResolvedValue({ id: HOTEL_ID, statutLicence: "ACTIF" }),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
    chambre: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    reservation: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    produit: { findMany: jest.fn().mockResolvedValue([]) },
    client: { findFirst: jest.fn(), create: jest.fn() },
  } as any;
}

function creerSupabaseAdminMock() {
  return {
    creerCompte: jest.fn().mockResolvedValue({ id: "auth-nouveau", email: "proprietaire@exemple.com" }),
    supprimerCompte: jest.fn().mockResolvedValue(undefined),
    envoyerRecuperation: jest.fn().mockResolvedValue(undefined),
    idDepuisJeton: jest.fn().mockResolvedValue("auth-1"),
    mettreAJourCompte: jest.fn().mockResolvedValue(undefined),
  } as any;
}

describe("PublicService", () => {
  let prisma: ReturnType<typeof creerPrismaMock>;
  let supabaseAdmin: ReturnType<typeof creerSupabaseAdminMock>;
  let service: PublicService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = creerPrismaMock();
    supabaseAdmin = creerSupabaseAdminMock();
    service = new PublicService(prisma, supabaseAdmin, { emettre: jest.fn() } as any);
    (extraireCouleursLogo as jest.Mock).mockResolvedValue(null);
  });

  describe("findChambresDisponibles", () => {
    it("sans dates, retourne les chambres LIBRE uniquement", async () => {
      await service.findChambresDisponibles({ sousDomaine: "chicago" } as any);
      expect(prisma.hotel.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ domainePersonnalise: "chicago" }, { sousDomaine: "chicago" }] },
      });
      expect(prisma.chambre.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { hotelId: HOTEL_ID, statut: "LIBRE" } })
      );
    });

    it("résout aussi bien un nom d'hôte complet (sous-domaine HotelSaver) qu'un domaine personnalisé", async () => {
      await service.findChambresDisponibles({ sousDomaine: "chicago.localhost" } as any);
      expect(prisma.hotel.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { domainePersonnalise: "chicago.localhost" },
            { sousDomaine: "chicago.localhost" },
            { sousDomaine: "chicago" },
          ],
        },
      });
    });

    it("avec des dates, exclut les chambres ayant une réservation active qui chevauche", async () => {
      prisma.reservation.findMany.mockResolvedValue([{ chambreId: "c1" }]);
      await service.findChambresDisponibles({
        sousDomaine: "chicago",
        dateArrivee: "2026-10-01",
        dateDepart: "2026-10-03",
      } as any);
      expect(prisma.chambre.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { hotelId: HOTEL_ID, id: { notIn: ["c1"] } } })
      );
    });

    it("refuse une plage de dates invalide", async () => {
      await expect(
        service.findChambresDisponibles({ sousDomaine: "chicago", dateArrivee: "2026-10-05", dateDepart: "2026-10-01" } as any)
      ).rejects.toThrow(BadRequestException);
    });

    it("lève NotFoundException si le sous-domaine est inconnu", async () => {
      prisma.hotel.findFirst.mockResolvedValue(null);
      await expect(service.findChambresDisponibles({ sousDomaine: "inconnu" } as any)).rejects.toThrow(
        NotFoundException
      );
    });

    it("lève NotFoundException si l'hôtel est SUSPENDU (sans distinguer d'un sous-domaine inconnu)", async () => {
      prisma.hotel.findFirst.mockResolvedValue({ id: HOTEL_ID, statutLicence: "SUSPENDU" });
      await expect(service.findChambresDisponibles({ sousDomaine: "chicago" } as any)).rejects.toThrow(
        NotFoundException
      );
    });

    it("lève NotFoundException si l'hôtel est RESILIE", async () => {
      prisma.hotel.findFirst.mockResolvedValue({ id: HOTEL_ID, statutLicence: "RESILIE" });
      await expect(service.findChambresDisponibles({ sousDomaine: "chicago" } as any)).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe("findMenu", () => {
    it("retourne les produits actifs de l'hôtel résolu", async () => {
      await service.findMenu({ sousDomaine: "chicago" } as any);
      expect(prisma.hotel.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ domainePersonnalise: "chicago" }, { sousDomaine: "chicago" }] },
      });
      expect(prisma.produit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { hotelId: HOTEL_ID, actif: true } })
      );
    });

    it("lève NotFoundException si le sous-domaine est inconnu", async () => {
      prisma.hotel.findFirst.mockResolvedValue(null);
      await expect(service.findMenu({ sousDomaine: "inconnu" } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe("creerDemandeReservation", () => {
    const dto = {
      sousDomaine: "chicago",
      chambreId: "c1",
      client: { nom: "Jean Visiteur", telephone: "+243900000000" },
      dateArrivee: "2026-10-01T00:00:00.000Z",
      dateDepart: "2026-10-03T00:00:00.000Z",
    };

    it("lève NotFoundException si la chambre n'existe pas", async () => {
      prisma.chambre.findUnique.mockResolvedValue(null);
      await expect(service.creerDemandeReservation(dto as any)).rejects.toThrow(NotFoundException);
    });

    it("réutilise un client existant trouvé par téléphone plutôt que d'en créer un nouveau", async () => {
      prisma.chambre.findUnique.mockResolvedValue({ id: "c1" });
      prisma.client.findFirst.mockResolvedValue({ id: "client-existant" });
      prisma.reservation.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const resa = await service.creerDemandeReservation(dto as any);

      expect(prisma.client.create).not.toHaveBeenCalled();
      expect(resa.clientId).toBe("client-existant");
    });

    it("crée toujours la réservation en EN_ATTENTE / SITE_PUBLIC, jamais confirmée", async () => {
      prisma.chambre.findUnique.mockResolvedValue({ id: "c1" });
      prisma.client.findFirst.mockResolvedValue(null);
      prisma.client.create.mockResolvedValue({ id: "nouveau-client" });
      prisma.reservation.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const resa = await service.creerDemandeReservation(dto as any);

      expect(resa.statut).toBe("EN_ATTENTE");
      expect(resa.origine).toBe("SITE_PUBLIC");
      expect(resa.createdBy).toBe("SITE_PUBLIC");
    });
  });

  describe("obtenirInfoPublique", () => {
    it("renvoie nom/polices/palette de la charte graphique de l'hôtel résolu", async () => {
      prisma.hotel.findFirst.mockResolvedValue({
        id: HOTEL_ID,
        nom: "Hôtel Chicago",
        statutLicence: "ACTIF",
        branding: {
          logoUrl: "https://exemple.com/logo.png",
          policeAffichage: "Fraunces",
          policeCorps: "Public Sans",
          policeMono: "IBM Plex Mono",
          palette: { light: { bleu: "#1769E0" } },
        },
      });

      const resultat = await service.obtenirInfoPublique({ sousDomaine: "chicago" } as any);

      expect(prisma.hotel.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ domainePersonnalise: "chicago" }, { sousDomaine: "chicago" }] },
        include: { branding: true, site: true },
      });
      expect(resultat).toEqual({
        nom: "Hôtel Chicago",
        adresse: null,
        telephoneContact: null,
        emailContact: null,
        slogan: null,
        presentation: null,
        couvertureUrl: null,
        galerie: [],
        services: [],
        whatsapp: null,
        horaireArrivee: null,
        horaireDepart: null,
        reception24h: false,
        lienCarte: null,
        reseaux: {},
        logoUrl: "https://exemple.com/logo.png",
        policeAffichage: "Fraunces",
        policeCorps: "Public Sans",
        policeMono: "IBM Plex Mono",
        palette: { light: { bleu: "#1769E0" } },
      });
    });

    it("lève NotFoundException si le sous-domaine est inconnu", async () => {
      prisma.hotel.findFirst.mockResolvedValue(null);
      await expect(service.obtenirInfoPublique({ sousDomaine: "inconnu" } as any)).rejects.toThrow(NotFoundException);
    });

    it("lève NotFoundException si l'hôtel est SUSPENDU", async () => {
      prisma.hotel.findFirst.mockResolvedValue({ id: HOTEL_ID, statutLicence: "SUSPENDU" });
      await expect(service.obtenirInfoPublique({ sousDomaine: "chicago" } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe("listerHotelsPartenaires", () => {
    it("ne liste que les hôtels ACTIF, avec des champs publics minimaux", async () => {
      prisma.hotel.findMany.mockResolvedValue([
        {
          nom: "Hôtel Chicago",
          sousDomaine: "chicago",
          adresse: "Goma",
          emailContact: "secret@exemple.com",
          branding: { logoUrl: null, palette: { light: { bleu: "#1769E0" } } },
        },
      ]);

      const resultat = await service.listerHotelsPartenaires();

      expect(prisma.hotel.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { statutLicence: "ACTIF" } }));
      expect(resultat).toEqual([
        { nom: "Hôtel Chicago", sousDomaine: "chicago", logoUrl: null, adresse: "Goma", couleur: "#1769E0" },
      ]);
    });
  });

  describe("mot de passe oublié", () => {
    afterEach(() => {
      delete process.env.SITE_WEB_URL;
    });

    it("demande l'e-mail de récupération avec l'adresse normalisée et le lien de retour vers le site", async () => {
      process.env.SITE_WEB_URL = "https://hotelsaver.exemple";
      const reponse = await service.demanderReinitialisation({ email: "  Patron@Exemple.COM " });
      expect(supabaseAdmin.envoyerRecuperation).toHaveBeenCalledWith(
        "patron@exemple.com",
        "https://hotelsaver.exemple/reinitialiser-mot-de-passe"
      );
      expect(reponse).toEqual({ ok: true });
    });

    it("change le mot de passe du détenteur du jeton de récupération", async () => {
      await service.reinitialiserMotDePasse({ jeton: "jeton-valide", motDePasse: "nouveau-mdp-123" });
      expect(supabaseAdmin.idDepuisJeton).toHaveBeenCalledWith("jeton-valide");
      expect(supabaseAdmin.mettreAJourCompte).toHaveBeenCalledWith("auth-1", { motDePasse: "nouveau-mdp-123" });
    });

    it("refuse (401) un jeton invalide ou expiré, sans rien modifier", async () => {
      supabaseAdmin.idDepuisJeton.mockResolvedValue(null);
      await expect(service.reinitialiserMotDePasse({ jeton: "perime", motDePasse: "nouveau-mdp-123" })).rejects.toThrow(
        UnauthorizedException
      );
      expect(supabaseAdmin.mettreAJourCompte).not.toHaveBeenCalled();
    });
  });

  describe("inscrireHotel", () => {
    const dto = {
      nom: "Hôtel Test",
      sousDomaine: "hotel-test",
      nomProprietaire: "Jean Proprio",
      email: "proprietaire@exemple.com",
      motDePasse: "motdepasse123",
    };

    it("crée le compte Supabase puis l'hôtel en ESSAI avec la palette par défaut et le premier PATRON", async () => {
      prisma.hotel.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "h2", ...data }));

      await service.inscrireHotel(dto as any);

      expect(supabaseAdmin.creerCompte).toHaveBeenCalledWith({ email: dto.email, motDePasse: dto.motDePasse });
      expect(prisma.hotel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nom: "Hôtel Test",
            sousDomaine: "hotel-test",
            statutLicence: "ESSAI",
            branding: { create: { palette: PALETTE_DEFAUT } },
            utilisateurs: {
              create: [{ nom: "Jean Proprio", role: "PATRON", actif: true, supabaseAuthId: "auth-nouveau" }],
            },
          }),
        })
      );
      expect(supabaseAdmin.supprimerCompte).not.toHaveBeenCalled();
    });

    it("supprime le compte Supabase et renvoie 409 si le sous-domaine est déjà pris", async () => {
      prisma.hotel.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("unique violation", { code: "P2002", clientVersion: "7.10.0" })
      );

      await expect(service.inscrireHotel(dto as any)).rejects.toThrow(ConflictException);
      expect(supabaseAdmin.supprimerCompte).toHaveBeenCalledWith("auth-nouveau");
    });

    it("dérive la palette du logo quand logoUrl est fourni, et l'enregistre sur la HotelBranding", async () => {
      (extraireCouleursLogo as jest.Mock).mockResolvedValue({ bleu: "#FF0000", navy: "#111111" });
      prisma.hotel.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "h2", ...data }));

      await service.inscrireHotel({ ...dto, logoUrl: "https://exemple.com/logo.png" } as any);

      expect(extraireCouleursLogo).toHaveBeenCalledWith("https://exemple.com/logo.png");
      const appel = prisma.hotel.create.mock.calls[0][0];
      expect(appel.data.branding.create.logoUrl).toBe("https://exemple.com/logo.png");
      expect(appel.data.branding.create.palette).not.toEqual(PALETTE_DEFAUT);
    });

    it("n'appelle pas extraireCouleursLogo si aucun logoUrl n'est fourni (comportement Phase 4 inchangé)", async () => {
      prisma.hotel.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "h2", ...data }));
      await service.inscrireHotel(dto as any);
      expect(extraireCouleursLogo).not.toHaveBeenCalled();
    });
  });
});
