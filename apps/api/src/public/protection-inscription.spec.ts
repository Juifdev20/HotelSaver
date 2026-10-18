import { HttpException } from "@nestjs/common";
import { MESSAGE_TROP_D_INSCRIPTIONS, appareilValide, empreinte, essaiDejaUtilise, noterInscription, verifierLimiteInscriptions } from "./protection-inscription";

/** Protection contre les essais abusifs à l'inscription (18/10/2026). */
describe("protection à l'inscription", () => {
  const prisma = () =>
    ({
      inscriptionRecente: { count: jest.fn().mockResolvedValue(0), create: jest.fn((a) => a) },
      essaiUtilise: { count: jest.fn().mockResolvedValue(0), upsert: jest.fn((a) => a) },
      $transaction: jest.fn().mockResolvedValue([]),
    }) as any;

  it("empreinte : stable, salée, jamais la valeur en clair", () => {
    process.env.EMPREINTE_SEL = "sel-de-test";
    const a = empreinte("+243828497219");
    expect(a).toBe(empreinte(" +243828497219 "));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("828497219");
    process.env.EMPREINTE_SEL = "autre-sel";
    expect(empreinte("+243828497219")).not.toBe(a);
  });

  it("identifiant d'appareil : seul un jeton raisonnable est retenu", () => {
    expect(appareilValide("a1b2c3d4e5f6a7b8")).toBe("a1b2c3d4e5f6a7b8");
    expect(appareilValide(["a1b2c3d4e5f6a7b8"])).toBe("a1b2c3d4e5f6a7b8");
    expect(appareilValide("court")).toBeNull();
    expect(appareilValide("pas d'espaces ni ; de <script>")).toBeNull();
    expect(appareilValide(undefined)).toBeNull();
  });

  it("limite du jour : refuse (429) dès que la même adresse OU le même appareil a atteint le maximum", async () => {
    const p = prisma();
    p.inscriptionRecente.count.mockResolvedValue(2);
    const erreur = await verifierLimiteInscriptions(p, "41.243.0.1", "appareil-abcdef12", 2).catch((e) => e);
    expect(erreur).toBeInstanceOf(HttpException);
    expect((erreur as HttpException).getStatus()).toBe(429);
    expect((erreur as HttpException).message).toBe(MESSAGE_TROP_D_INSCRIPTIONS);
    const filtre = p.inscriptionRecente.count.mock.calls[0][0].where;
    expect(filtre.OR).toHaveLength(2); // adresse et appareil
  });

  it("limite du jour : en dessous du maximum, ou sans appareil, l'inscription passe", async () => {
    const p = prisma();
    p.inscriptionRecente.count.mockResolvedValue(1);
    await expect(verifierLimiteInscriptions(p, "41.243.0.1", null, 2)).resolves.toBeUndefined();
    expect(p.inscriptionRecente.count.mock.calls[0][0].where.OR).toHaveLength(1);
  });

  it("un essai par numéro : vrai dès qu'une empreinte existe", async () => {
    const p = prisma();
    expect(await essaiDejaUtilise(p, "+243828497219")).toBe(false);
    p.essaiUtilise.count.mockResolvedValue(1);
    expect(await essaiDejaUtilise(p, "+243828497219")).toBe(true);
  });

  it("après inscription : empreinte du numéro et trace de l'origine, ensemble", async () => {
    const p = prisma();
    await noterInscription(p, "+243828497219", "41.243.0.1", "appareil-abcdef12");
    expect(p.$transaction).toHaveBeenCalledTimes(1);
    expect(p.essaiUtilise.upsert.mock.calls[0][0].where.telephoneEmpreinte).toBe(empreinte("+243828497219"));
    expect(p.inscriptionRecente.create.mock.calls[0][0].data).toEqual({ ipEmpreinte: empreinte("41.243.0.1"), appareilEmpreinte: empreinte("appareil-abcdef12") });
  });
});
