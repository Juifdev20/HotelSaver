import { ConflictException } from "@nestjs/common";
import { ConditionsAdminController } from "./conditions-admin.controller";

/** Publication des conditions d'utilisation depuis le super-admin (19/10/2026). */
describe("ConditionsAdminController", () => {
  const superAdmin = { id: "sa-1", supabaseAuthId: "a", nom: "Admin" };
  const texte = "x".repeat(250);

  function monter(derniere: { version: number; texte: string } | null) {
    const prisma: any = {
      conditionsUtilisation: {
        findFirst: jest.fn().mockResolvedValue(derniere),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "c", ...data })),
      },
    };
    return { prisma, controleur: new ConditionsAdminController(prisma) };
  }

  it("publie la version suivante, au nom du super-admin", async () => {
    const { controleur, prisma } = monter({ version: 3, texte: "ancien" });
    await controleur.publier({ texte: `  ${texte}\r\n` }, superAdmin);
    expect(prisma.conditionsUtilisation.create.mock.calls[0][0].data).toEqual({ version: 4, texte, publiePar: "sa-1" });
  });

  it("refuse un texte identique à la version en vigueur", async () => {
    const { controleur, prisma } = monter({ version: 1, texte });
    await expect(controleur.publier({ texte }, superAdmin)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.conditionsUtilisation.create).not.toHaveBeenCalled();
  });
});
