import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@hotel-chicago/database";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { UtilisateursService } from "./utilisateurs.service";

const HOTEL_ID = "hotel-1";
const PATRON: UtilisateurAuthentifie = {
  userId: "patron-1",
  supabaseAuthId: "auth-patron",
  role: Role.PATRON,
  nom: "Patron Test",
  hotelId: HOTEL_ID,
};

function creerPrismaMock() {
  return {
    utilisateur: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    sessionUtilisateur: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
  } as any;
}

function creerSupabaseAdminMock() {
  return {
    creerCompte: jest.fn().mockResolvedValue({ id: "auth-nouveau", email: "employe@exemple.com" }),
    supprimerCompte: jest.fn().mockResolvedValue(undefined),
    mettreAJourCompte: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function erreurContrainteUnique(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

describe("UtilisateursService", () => {
  let prisma: ReturnType<typeof creerPrismaMock>;
  let supabaseAdmin: ReturnType<typeof creerSupabaseAdminMock>;
  let service: UtilisateursService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = creerPrismaMock();
    supabaseAdmin = creerSupabaseAdminMock();
    service = new UtilisateursService(prisma, supabaseAdmin);
  });

  describe("findAll", () => {
    it("liste les utilisateurs scopés au hotelId, sans supabaseAuthId", async () => {
      await service.findAll(HOTEL_ID);
      expect(prisma.utilisateur.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hotelId: HOTEL_ID },
          select: expect.not.objectContaining({ supabaseAuthId: true }),
        })
      );
    });
  });

  describe("create", () => {
    const dto = { nom: "Employé Café", email: "employe@exemple.com", motDePasse: "motdepasse123", role: Role.CAFETARIA };

    it("refuse un deuxième compte pour un rôle déjà pris — avant tout appel Supabase", async () => {
      prisma.utilisateur.count.mockResolvedValue(1);
      await expect(service.create(dto as any, HOTEL_ID)).rejects.toThrow(ConflictException);
      await expect(service.create(dto as any, HOTEL_ID)).rejects.toThrow(/déjà un compte Cafétaria/);
      expect(prisma.utilisateur.count).toHaveBeenCalledWith({ where: { hotelId: HOTEL_ID, role: Role.CAFETARIA } });
      expect(supabaseAdmin.creerCompte).not.toHaveBeenCalled();
      expect(prisma.utilisateur.create).not.toHaveBeenCalled();
    });

    it("crée le compte Supabase puis la ligne Utilisateur", async () => {
      prisma.utilisateur.create.mockResolvedValue({ id: "u-1", ...dto, actif: true });
      await service.create(dto as any, HOTEL_ID);
      expect(supabaseAdmin.creerCompte).toHaveBeenCalledWith({
        email: dto.email,
        motDePasse: dto.motDePasse,
        emailConfirme: true,
      });
      expect(prisma.utilisateur.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nom: dto.nom, email: dto.email, role: dto.role, hotelId: HOTEL_ID, supabaseAuthId: "auth-nouveau" }),
        })
      );
    });

    it("supprime le compte Supabase si l'écriture Prisma échoue (email déjà utilisé)", async () => {
      prisma.utilisateur.create.mockRejectedValue(erreurContrainteUnique());
      await expect(service.create(dto as any, HOTEL_ID)).rejects.toThrow(ConflictException);
      expect(supabaseAdmin.supprimerCompte).toHaveBeenCalledWith("auth-nouveau");
    });

    it("propage les autres erreurs Prisma après rollback du compte Supabase", async () => {
      prisma.utilisateur.create.mockRejectedValue(new Error("panne base"));
      await expect(service.create(dto as any, HOTEL_ID)).rejects.toThrow("panne base");
      expect(supabaseAdmin.supprimerCompte).toHaveBeenCalledWith("auth-nouveau");
    });
  });

  describe("update", () => {
    const EXISTANT = { id: "u-2", hotelId: HOTEL_ID, email: "ancien@exemple.com", supabaseAuthId: "auth-u2" };

    it("refuse une mise à jour sans aucun champ", async () => {
      await expect(service.update("u-2", {}, PATRON)).rejects.toThrow(BadRequestException);
    });

    it("refuse qu'un PATRON désactive son propre compte", async () => {
      await expect(service.update(PATRON.userId, { actif: false }, PATRON)).rejects.toThrow(BadRequestException);
      expect(prisma.utilisateur.update).not.toHaveBeenCalled();
    });

    it("autorise un PATRON à modifier son propre nom/email (seule la désactivation est bloquée)", async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({ id: PATRON.userId, hotelId: HOTEL_ID, email: "p@x.com", supabaseAuthId: "auth-p" });
      prisma.utilisateur.update.mockResolvedValue({ id: PATRON.userId, nom: "Nouveau Nom" });
      await service.update(PATRON.userId, { nom: "Nouveau Nom" }, PATRON);
      expect(prisma.utilisateur.update).toHaveBeenCalled();
    });

    it("404 si l'utilisateur cible n'existe pas", async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(null);
      await expect(service.update("inconnu", { actif: false }, PATRON)).rejects.toThrow(NotFoundException);
    });

    it("404 si l'utilisateur cible appartient à un autre hôtel", async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({ id: "u-2", hotelId: "autre-hotel" });
      await expect(service.update("u-2", { actif: false }, PATRON)).rejects.toThrow(NotFoundException);
    });

    it("désactive un compte du même hôtel", async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(EXISTANT);
      prisma.utilisateur.update.mockResolvedValue({ id: "u-2", actif: false });
      await service.update("u-2", { actif: false }, PATRON);
      expect(prisma.utilisateur.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "u-2" }, data: { actif: false } })
      );
      expect(supabaseAdmin.mettreAJourCompte).not.toHaveBeenCalled();
    });

    it("met à jour email et mot de passe dans Supabase AVANT Prisma", async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(EXISTANT);
      prisma.utilisateur.update.mockResolvedValue({ id: "u-2" });
      await service.update("u-2", { email: "nouveau@exemple.com", motDePasse: "nouveaumdp123" }, PATRON);
      expect(supabaseAdmin.mettreAJourCompte).toHaveBeenCalledWith("auth-u2", {
        email: "nouveau@exemple.com",
        motDePasse: "nouveaumdp123",
      });
      expect(prisma.utilisateur.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: "nouveau@exemple.com" }) })
      );
    });

    it("renvoie 409 et tente de remettre l'ancien email si Prisma refuse (P2002)", async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(EXISTANT);
      prisma.utilisateur.update.mockRejectedValue(erreurContrainteUnique());
      await expect(service.update("u-2", { email: "nouveau@exemple.com" }, PATRON)).rejects.toThrow(ConflictException);
      expect(supabaseAdmin.mettreAJourCompte).toHaveBeenLastCalledWith("auth-u2", { email: "ancien@exemple.com" });
    });
  });
});
