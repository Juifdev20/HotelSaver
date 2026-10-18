jest.mock("../common/palette/extraire-couleurs-logo");

import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@hotel-chicago/database";
import { PublicService } from "./public.service";
import { PALETTE_DEFAUT } from "../common/palette-defaut";
import { extraireCouleursLogo } from "../common/palette/extraire-couleurs-logo";

const HOTEL_ID = "hotel-1";

function creerPrismaMock() {
  return {
    superAdmin: { findUnique: jest.fn().mockResolvedValue(null) },
    utilisateur: { findUnique: jest.fn().mockResolvedValue(null) },
    hotel: {
      findFirst: jest.fn().mockResolvedValue({ id: HOTEL_ID, statutLicence: "ACTIF" }),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
    paiementLicence: { count: jest.fn().mockResolvedValue(0) },
    paiementReservation: { findMany: jest.fn().mockResolvedValue([]) },
    chambre: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    reservation: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    hotelSite: { findUnique: jest.fn().mockResolvedValue({ whatsapp: "+243970000000" }) },
    $transaction: jest.fn().mockResolvedValue([]),
    // Protection contre les essais abusifs (18/10/2026) : numéro jamais utilisé, aucune inscription récente.
    inscriptionRecente: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
    essaiUtilise: { count: jest.fn().mockResolvedValue(0), upsert: jest.fn() },
    produit: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    client: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    sessionUtilisateur: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    compteCafeteria: { create: jest.fn(), delete: jest.fn() },
    sousCompte: { deleteMany: jest.fn() },
    ligneCommande: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), deleteMany: jest.fn() },
    mouvementStock: { create: jest.fn(), deleteMany: jest.fn() },
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
  let notifications: { emettre: jest.Mock };
  let paiements: { presenter: jest.Mock };
  let remboursements: { creerSiAcompteEnLigne: jest.Mock };
  let service: PublicService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = creerPrismaMock();
    supabaseAdmin = creerSupabaseAdminMock();
    notifications = { emettre: jest.fn() };
    paiements = { presenter: jest.fn().mockResolvedValue(null) };
    remboursements = { creerSiAcompteEnLigne: jest.fn().mockResolvedValue(undefined) };
    service = new PublicService(prisma, supabaseAdmin, notifications as any, paiements as any, remboursements as any);
    (extraireCouleursLogo as jest.Mock).mockResolvedValue(null);
  });

  describe("findChambresDisponibles", () => {
    it("sans dates, retourne TOUTES les chambres avec leur disponibilité du jour", async () => {
      prisma.chambre.findMany.mockResolvedValue([{ id: "c1", numero: "1" }, { id: "c2", numero: "2" }]);
      const dateDepart = new Date(Date.now() + 2 * 86_400_000);
      prisma.reservation.findMany.mockResolvedValue([{ chambreId: "c1", dateDepart }]);
      const l = await service.findChambresDisponibles({ sousDomaine: "chicago" } as any);
      expect(l).toEqual([
        expect.objectContaining({ id: "c1", disponibilite: "RESERVEE", libreLe: dateDepart.toISOString().slice(0, 10) }),
        expect.objectContaining({ id: "c2", disponibilite: "DISPONIBLE", libreLe: null }),
      ]);
      expect(prisma.hotel.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ domainePersonnalise: "chicago" }, { sousDomaine: "chicago" }] },
      });
      expect(prisma.chambre.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { hotelId: HOTEL_ID } }));
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

    it("avec des dates, marque « RESERVEE » les chambres ayant une réservation confirmée qui chevauche (elles restent listées)", async () => {
      prisma.chambre.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
      prisma.reservation.findMany.mockResolvedValue([{ chambreId: "c1", dateDepart: new Date("2026-10-03") }]);
      const l = await service.findChambresDisponibles({
        sousDomaine: "chicago",
        dateArrivee: "2026-10-01",
        dateDepart: "2026-10-03",
      } as any);
      expect(l.map((c: any) => [c.id, c.disponibilite])).toEqual([["c1", "RESERVEE"], ["c2", "DISPONIBLE"]]);
      expect(l.every((c: any) => c.libreLe === null)).toBe(true);
      expect(prisma.reservation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ statut: { in: ["CONFIRMEE", "EN_COURS"] } }) }));
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

  describe("creerCommandeWeb", () => {
    const dto = {
      sousDomaine: "chicago",
      client: { nom: "Aline Web", telephone: "+243999000000", chambre: "12", note: "sans piment" },
      lignes: [
        { produitId: "p1", quantite: 2, note: "bien cuit" },
        { produitId: "p2", quantite: 1 },
      ],
    };

    function hotelAvecCommandeWeb() {
      prisma.hotel.findFirst.mockResolvedValue({
        id: HOTEL_ID,
        statutLicence: "ACTIF",
        commandeWebActivee: true,
        cuisineActivee: true,
      });
    }

    it("lève NotFoundException si l'hôtel n'a pas activé la commande en ligne", async () => {
      prisma.hotel.findFirst.mockResolvedValue({ id: HOTEL_ID, statutLicence: "ACTIF", commandeWebActivee: false });
      await expect(service.creerCommandeWeb(dto as any)).rejects.toThrow(NotFoundException);
      expect(prisma.compteCafeteria.create).not.toHaveBeenCalled();
    });

    it("rejette un produit absent ou non commandable en ligne", async () => {
      hotelAvecCommandeWeb();
      prisma.produit.findMany.mockResolvedValue([{ id: "p1", prix: 5, devise: "USD", stockActuel: 10 }]);
      await expect(service.creerCommandeWeb(dto as any)).rejects.toThrow(BadRequestException);
      expect(prisma.compteCafeteria.create).not.toHaveBeenCalled();
    });

    it("la requête produits n'accepte que des plats commandables (les articles de comptoir sont rejetés côté requête)", async () => {
      hotelAvecCommandeWeb();
      prisma.produit.findMany.mockResolvedValue([]);
      await expect(service.creerCommandeWeb(dto as any)).rejects.toThrow(BadRequestException);
      expect(prisma.produit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ hotelId: HOTEL_ID, actif: true, commandableEnLigne: true, typeProduit: "PLAT" }),
        })
      );
      expect(prisma.compteCafeteria.create).not.toHaveBeenCalled();
    });

    it("crée un compte SITE_PUBLIC avec lignes EN_ATTENTE (cuisine active), prix serveur et notification", async () => {
      hotelAvecCommandeWeb();
      prisma.produit.findMany.mockResolvedValue([
        { id: "p1", nom: "Pizza", prix: 5, devise: "USD", typeProduit: "PLAT" },
        { id: "p2", nom: "Jus", prix: 2000, devise: "CDF", typeProduit: "PLAT" },
      ]);
      prisma.compteCafeteria.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "compte-web-123456", ...data, sousComptes: [{ id: "sc1" }] })
      );
      prisma.ligneCommande.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "l1", ...data }));

      const resultat = await service.creerCommandeWeb(dto as any);

      expect(prisma.compteCafeteria.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hotelId: HOTEL_ID,
            origine: "SITE_PUBLIC",
            ouvertPar: "SITE_PUBLIC",
            contactClient: "+243999000000 · ch. 12",
            noteClient: "sans piment",
          }),
        })
      );
      // Prix repris en base (5 USD et 2000 CDF), jamais depuis le client.
      expect(prisma.ligneCommande.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ produitId: "p1", prixUnitaire: 5, devise: "USD", statut: "EN_ATTENTE", note: "bien cuit" }),
        })
      );
      expect(prisma.ligneCommande.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ produitId: "p2", prixUnitaire: 2000, devise: "CDF" }) })
      );
      // Un plat n'a pas de stock compté : aucun décrément ni mouvement.
      expect(prisma.mouvementStock.create).not.toHaveBeenCalled();
      expect(notifications.emettre).toHaveBeenCalledWith(
        expect.objectContaining({ hotelId: HOTEL_ID, type: "COMMANDE_WEB" })
      );
      expect(resultat.totalUSD).toBe(10);
      expect(resultat.totalCDF).toBe(2000);
      expect(resultat.reference).toBe("COMPTE-W");
    });

    it("crée les lignes directement SERVI quand la cuisine interne est désactivée", async () => {
      prisma.hotel.findFirst.mockResolvedValue({
        id: HOTEL_ID,
        statutLicence: "ACTIF",
        commandeWebActivee: true,
        cuisineActivee: false,
      });
      prisma.produit.findMany.mockResolvedValue([{ id: "p1", nom: "Pizza", prix: 5, devise: "USD", typeProduit: "PLAT" }]);
      prisma.compteCafeteria.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "c-web", ...data, sousComptes: [{ id: "sc1" }] })
      );
      prisma.ligneCommande.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "l1", ...data }));

      await service.creerCommandeWeb({ ...dto, lignes: [{ produitId: "p1", quantite: 1 }] } as any);

      expect(prisma.ligneCommande.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ statut: "SERVI" }) })
      );
    });

    it("défait la commande partielle si la création d'une ligne échoue en cours de route", async () => {
      hotelAvecCommandeWeb();
      prisma.produit.findMany.mockResolvedValue([
        { id: "p1", nom: "Pizza", prix: 5, devise: "USD", typeProduit: "PLAT" },
        { id: "p2", nom: "Jus", prix: 2000, devise: "CDF", typeProduit: "PLAT" },
      ]);
      prisma.compteCafeteria.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "c-web", ...data, sousComptes: [{ id: "sc1" }] })
      );
      prisma.ligneCommande.findMany.mockResolvedValue([{ id: "l1" }]);
      prisma.ligneCommande.create
        .mockResolvedValueOnce({ id: "l1" })
        .mockRejectedValueOnce(new Error("contrainte violée"));

      await expect(service.creerCommandeWeb(dto as any)).rejects.toThrow("contrainte violée");

      // Lignes, sous-compte et compte supprimés — pas de compte fantôme.
      expect(prisma.ligneCommande.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["l1"] } } });
      expect(prisma.sousCompte.deleteMany).toHaveBeenCalledWith({ where: { compteId: "c-web" } });
      expect(prisma.compteCafeteria.delete).toHaveBeenCalledWith({ where: { id: "c-web" } });
      expect(notifications.emettre).not.toHaveBeenCalled();
    });
  });

  describe("findMenu", () => {
    it("retourne les produits actifs de l'hôtel résolu", async () => {
      await service.findMenu({ sousDomaine: "chicago" } as any);
      expect(prisma.hotel.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ domainePersonnalise: "chicago" }, { sousDomaine: "chicago" }] },
      });
      expect(prisma.produit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { hotelId: HOTEL_ID, actif: true, commandableEnLigne: true, typeProduit: "PLAT" } })
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

    it("refuse (409) une chambre déjà réservée pour ces dates : aucune fiche client ni réservation n'est créée", async () => {
      prisma.chambre.findUnique.mockResolvedValue({ id: "c1" });
      prisma.reservation.findMany.mockResolvedValue([{ chambreId: "c1", dateDepart: new Date("2026-10-03") }]);
      await expect(service.creerDemandeReservation(dto as any)).rejects.toThrow(ConflictException);
      expect(prisma.client.create).not.toHaveBeenCalled();
      expect(prisma.reservation.create).not.toHaveBeenCalled();
    });

    it("ne se rattache JAMAIS à une fiche client existante (même téléphone) : une nouvelle fiche est créée", async () => {
      prisma.chambre.findUnique.mockResolvedValue({ id: "c1" });
      prisma.client.findFirst.mockResolvedValue({ id: "client-existant" });
      prisma.client.create.mockResolvedValue({ id: "client-neuf" });
      prisma.reservation.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "r1", jetonSuivi: "jeton-1", ...data }));

      await service.creerDemandeReservation(dto as any);

      expect(prisma.client.findFirst).not.toHaveBeenCalled();
      expect(prisma.client.create).toHaveBeenCalledTimes(1);
      expect(prisma.reservation.create.mock.calls[0][0].data.clientId).toBe("client-neuf");
    });

    it("crée toujours la réservation en EN_ATTENTE / SITE_PUBLIC, jamais confirmée", async () => {
      prisma.chambre.findUnique.mockResolvedValue({ id: "c1" });
      prisma.client.findFirst.mockResolvedValue(null);
      prisma.client.create.mockResolvedValue({ id: "nouveau-client" });
      prisma.reservation.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "r1", jetonSuivi: "jeton-1", ...data }));

      const resa = await service.creerDemandeReservation(dto as any);

      const { data } = prisma.reservation.create.mock.calls[0][0];
      expect(data.statut).toBe("EN_ATTENTE");
      expect(data.origine).toBe("SITE_PUBLIC");
      expect(data.createdBy).toBe("SITE_PUBLIC");
      // Le site ne reçoit que le jeton de suivi, jamais la fiche client.
      expect(resa).toEqual({ id: "r1", statut: "EN_ATTENTE", jetonSuivi: "jeton-1" });
    });
  });

  describe("suivi de réservation par le client", () => {
    const demain = new Date(Date.now() + 2 * 86_400_000);
    const reservation = (over: Record<string, unknown> = {}) => ({
      id: "r1",
      clientId: "client-1",
      jetonSuivi: "1a2b3c4d-0000-4000-8000-000000000000",
      statut: "CONFIRMEE",
      dateArrivee: demain,
      dateDepart: new Date(demain.getTime() + 2 * 86_400_000),
      acompte: "10",
      motifAnnulation: null,
      heureArriveePrevue: null,
      demandeClient: null,
      preEnregistreLe: null,
      reponseReception: null,
      chambre: { numero: "12", type: "Double", prixParNuit: "45", devise: "USD" },
      client: { nom: "Jean Visiteur", typePiece: "CNI", numeroPiece: "SECRET-123" },
      ...over,
    });
    const q = { sousDomaine: "chicago" };

    it("cherche le jeton dans l'hôtel du site consulté seulement (404 sinon)", async () => {
      prisma.reservation.findFirst.mockResolvedValue(null);
      await expect(service.obtenirSuiviReservation("jeton", q)).rejects.toThrow(NotFoundException);
      expect(prisma.reservation.findFirst.mock.calls[0][0].where).toEqual({ jetonSuivi: "jeton", hotelId: HOTEL_ID });
    });

    it("ne renvoie jamais le numéro de pièce ni le motif interne", async () => {
      prisma.reservation.findFirst.mockResolvedValue(reservation({ statut: "ANNULEE", motifAnnulation: "Client douteux" }));
      const suivi = await service.obtenirSuiviReservation("jeton", q);
      expect(JSON.stringify(suivi)).not.toContain("SECRET-123");
      expect(JSON.stringify(suivi)).not.toContain("Client douteux");
      expect(suivi.statut).toBe("NON_RETENUE");
      expect(suivi.preEnregistrement.pieceRenseignee).toBe(true);
    });

    it("expose la réponse de la réception au client", async () => {
      prisma.reservation.findFirst.mockResolvedValue(reservation({ reponseReception: "Acompte de 30 $ attendu à l'arrivée." }));
      const suivi = await service.obtenirSuiviReservation("jeton", q);
      expect(suivi.reponseReception).toBe("Acompte de 30 $ attendu à l'arrivée.");
    });

    it("calcule code, nuits, total estimé et droits du client", async () => {
      prisma.reservation.findFirst.mockResolvedValue(reservation());
      const suivi = await service.obtenirSuiviReservation("jeton", q);
      expect(suivi).toMatchObject({
        code: "RES-1A2B3C4D",
        statut: "CONFIRMEE",
        nuits: 2,
        totalEstime: "90",
        devise: "USD",
        hotel: { whatsapp: "+243970000000" },
        peutAnnuler: true,
        peutPreEnregistrer: true,
      });
    });

    it("un acompte déjà versé ne s'annule pas depuis le lien : la réception décide", async () => {
      prisma.reservation.findFirst.mockResolvedValueOnce(reservation());
      await expect(service.annulerReservationPublique("jeton", q, {})).rejects.toThrow(/acompte/i);
      expect(prisma.reservation.update).not.toHaveBeenCalled();
    });

    it("annulation par le client (sans acompte) : motif reconnaissable et réception prévenue", async () => {
      prisma.reservation.findFirst
        .mockResolvedValueOnce(reservation({ acompte: "0" }))
        .mockResolvedValueOnce(reservation({ statut: "ANNULEE", motifAnnulation: "Annulée par le client depuis le site" }));
      const suivi = await service.annulerReservationPublique("jeton", q, { motif: "Vol annulé" });
      expect(prisma.reservation.update.mock.calls[0][0].data).toMatchObject({
        statut: "ANNULEE",
        motifAnnulation: "Annulée par le client depuis le site : Vol annulé",
        syncVersion: { increment: 1 },
      });
      expect(notifications.emettre.mock.calls[0][0].roles).toEqual(["RECEPTIONNISTE", "PATRON"]);
      expect(suivi.statut).toBe("ANNULEE");
    });

    it("refuse l'annulation d'un séjour commencé ou terminé", async () => {
      prisma.reservation.findFirst.mockResolvedValue(reservation({ statut: "EN_COURS" }));
      await expect(service.annulerReservationPublique("jeton", q, {})).rejects.toThrow(ConflictException);
      prisma.reservation.findFirst.mockResolvedValue(reservation({ dateArrivee: new Date(Date.now() - 3 * 86_400_000) }));
      await expect(service.annulerReservationPublique("jeton", q, {})).rejects.toThrow(ConflictException);
    });

    it("pré-enregistrement : pièce sur le client, heure et demande sur la réservation, syncVersion+1, notification", async () => {
      prisma.reservation.findFirst.mockResolvedValue(reservation());
      await service.preEnregistrer("jeton", q, {
        typePiece: "PASSEPORT",
        numeroPiece: " OP1234567 ",
        heureArriveePrevue: "14:30",
        demandeClient: "  Lit bébé  ",
      });
      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: "client-1" },
        data: { typePiece: "PASSEPORT", numeroPiece: "OP1234567", syncVersion: { increment: 1 } },
      });
      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: "r1" },
        data: expect.objectContaining({ heureArriveePrevue: "14:30", demandeClient: "Lit bébé", syncVersion: { increment: 1 } }),
      });
      expect(notifications.emettre.mock.calls[0][0]).toMatchObject({ type: "PRE_ENREGISTREMENT" });
    });
  });

  describe("obtenirInfoPublique", () => {
    it("renvoie nom/polices/palette de la charte graphique de l'hôtel résolu", async () => {
      prisma.hotel.findFirst.mockResolvedValue({
        id: HOTEL_ID,
        nom: "Hôtel Chicago",
        statutLicence: "ACTIF",
        branding: {
          commandeWebActivee: false,
        reservationEnLigne: true,
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
        commandeWebActivee: false,
        reservationEnLigne: true,
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

    it("par numéro : envoie le lien à l'e-mail réel du compte", async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({ email: "patron@exemple.com" });
      const reponse = await service.demanderReinitialisation({ telephone: "0970 000 000" });
      expect(prisma.utilisateur.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { telephone: "+243970000000" } })
      );
      expect(supabaseAdmin.envoyerRecuperation).toHaveBeenCalledWith("patron@exemple.com", expect.any(String));
      expect(reponse).toEqual({ ok: true });
    });

    it("par numéro sans e-mail réel (ou numéro inconnu) : rien n'est envoyé, même réponse", async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({ email: null });
      expect(await service.demanderReinitialisation({ telephone: "+243970000000" })).toEqual({ ok: true });
      prisma.utilisateur.findUnique.mockResolvedValue(null);
      expect(await service.demanderReinitialisation({ telephone: "+243812345678" })).toEqual({ ok: true });
      expect(supabaseAdmin.envoyerRecuperation).not.toHaveBeenCalled();
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
      telephoneProprietaire: "0970000000",
      email: "proprietaire@exemple.com",
      motDePasse: "motdepasse123",
    };

    it("crée le compte Supabase puis l'hôtel en ESSAI avec la palette par défaut et le premier PATRON", async () => {
      prisma.hotel.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "h2", ...data }));

      await service.inscrireHotel(dto as any);

      expect(supabaseAdmin.creerCompte).toHaveBeenCalledWith({
        telephone: "+243970000000",
        email: dto.email,
        motDePasse: dto.motDePasse,
      });
      expect(prisma.hotel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nom: "Hôtel Test",
            sousDomaine: "hotel-test",
            statutLicence: "ESSAI",
            branding: { create: { palette: PALETTE_DEFAUT } },
            utilisateurs: {
              create: [
                {
                  nom: "Jean Proprio",
                  role: "PATRON",
                  actif: true,
                  supabaseAuthId: "auth-nouveau",
                  telephone: "+243970000000",
                  email: dto.email,
                },
              ],
            },
          }),
        })
      );
      expect(supabaseAdmin.supprimerCompte).not.toHaveBeenCalled();
    });

    it("sans téléphone d'hôtel fourni, le numéro du patron sert de contact de l'hôtel", async () => {
      prisma.hotel.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "h2", ...data }));
      await service.inscrireHotel(dto as any);
      expect(prisma.hotel.create.mock.calls[0][0].data.telephoneContact).toBe("+243970000000");

      prisma.hotel.create.mockClear();
      await service.inscrireHotel({ ...dto, telephoneContact: "+243 810 000 000" } as any);
      expect(prisma.hotel.create.mock.calls[0][0].data.telephoneContact).toBe("+243 810 000 000");
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
