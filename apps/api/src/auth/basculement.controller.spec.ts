import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";
import { BasculementController } from "./basculement.controller";

describe("BasculementController (changement de compte du patron)", () => {
  const patron: any = { userId: "u-patron", hotelId: "h1", role: Role.PATRON, nom: "Patron" };
  const prisma = { utilisateur: { findFirst: jest.fn() } };
  const admin = { lireEmailCompte: jest.fn(), creerSessionPour: jest.fn() };
  const controleur = new BasculementController(prisma as never, admin as never);

  beforeEach(() => {
    prisma.utilisateur.findFirst.mockReset();
    admin.lireEmailCompte.mockReset().mockResolvedValue("marie@interne.test");
    admin.creerSessionPour.mockReset().mockResolvedValue({ access_token: "a", refresh_token: "r", expires_in: 3600 });
  });

  it("ouvre la session d'un compte actif de SON hôtel (la recherche est limitée à l'hôtel du patron)", async () => {
    prisma.utilisateur.findFirst.mockResolvedValue({ id: "u2", role: Role.CAFETARIA, actif: true, supabaseAuthId: "sb2", nom: "Marie" });
    const session = await controleur.basculer({ utilisateurId: "u2" }, patron);
    expect(prisma.utilisateur.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "u2", hotelId: "h1" } }));
    expect(admin.lireEmailCompte).toHaveBeenCalledWith("sb2");
    expect(admin.creerSessionPour).toHaveBeenCalledWith("marie@interne.test");
    expect(session).toEqual({ access_token: "a", refresh_token: "r", expires_in: 3600 });
  });

  it("refuse un compte d'un autre hôtel (introuvable chez le patron)", async () => {
    prisma.utilisateur.findFirst.mockResolvedValue(null);
    await expect(controleur.basculer({ utilisateurId: "autre-hotel" }, patron)).rejects.toBeInstanceOf(NotFoundException);
    expect(admin.creerSessionPour).not.toHaveBeenCalled();
  });

  it("refuse un compte désactivé, un autre patron, et soi-même", async () => {
    prisma.utilisateur.findFirst.mockResolvedValue({ id: "u3", role: Role.RECEPTIONNISTE, actif: false, supabaseAuthId: "sb3", nom: "X" });
    await expect(controleur.basculer({ utilisateurId: "u3" }, patron)).rejects.toBeInstanceOf(BadRequestException);
    prisma.utilisateur.findFirst.mockResolvedValue({ id: "u4", role: Role.PATRON, actif: true, supabaseAuthId: "sb4", nom: "Y" });
    await expect(controleur.basculer({ utilisateurId: "u4" }, patron)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controleur.basculer({ utilisateurId: "u-patron" }, patron)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controleur.basculer({}, patron)).rejects.toBeInstanceOf(BadRequestException);
    expect(admin.creerSessionPour).not.toHaveBeenCalled();
  });
});
