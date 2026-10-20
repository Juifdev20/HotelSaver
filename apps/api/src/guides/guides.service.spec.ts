import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";
import { GuidesService } from "./guides.service";

const UUID = "0f8b2c1e-1a2b-4c3d-8e9f-0123456789ab";
const ligne = (guide: string, version: number) => ({
  id: `${guide}-${version}`,
  guide,
  version,
  fichier: `${guide}/${UUID}.pdf`,
  taille: 1000 * version,
  edition: `Édition ${version}`,
  publieLe: new Date("2026-10-20T10:00:00Z"),
  publiePar: "sa-1",
});

function service(versions = [ligne("RECEPTION", 2), ligne("RECEPTION", 1), ligne("PATRON", 1), ligne("COMPLET", 1)]) {
  const prisma = {
    guideUtilisation: {
      findMany: jest.fn(({ where }) => Promise.resolve(versions.filter((v) => !where || where.guide.in.includes(v.guide)))),
      findFirst: jest.fn(({ where }) => Promise.resolve(versions.find((v) => v.guide === where.guide) ?? null)),
      create: jest.fn(({ data }) => Promise.resolve({ id: "nouveau", ...data })),
    },
  };
  const storage = {
    urlSigneeGuide: jest.fn().mockResolvedValue("https://stockage/lien-signe"),
    urlEnvoiGuide: jest.fn().mockResolvedValue("https://stockage/envoi"),
    tailleGuide: jest.fn().mockResolvedValue(12345),
  };
  return { s: new GuidesService(prisma as never, storage as never), prisma, storage };
}

describe("GuidesService — lecture selon le rôle", () => {
  it("le patron voit la dernière version de chaque guide publié", async () => {
    const { s } = service();
    const liste = await s.listerPourRole(Role.PATRON);
    expect(liste.map((g) => [g.guide, g.version])).toEqual([["COMPLET", 1], ["PATRON", 1], ["RECEPTION", 2]]);
  });

  it("le réceptionniste ne voit que le guide de la réception", async () => {
    const { s } = service();
    expect((await s.listerPourRole(Role.RECEPTIONNISTE)).map((g) => g.guide)).toEqual(["RECEPTION"]);
  });

  it("la cafétaria ne voit rien tant que son guide n'est pas publié", async () => {
    const { s } = service();
    expect(await s.listerPourRole(Role.CAFETARIA)).toEqual([]);
  });

  it("refuse le lien d'un guide d'un autre poste", async () => {
    const { s, storage } = service();
    await expect(s.lienPourRole(Role.RECEPTIONNISTE, "PATRON")).rejects.toThrow(ForbiddenException);
    await expect(s.lienPourRole(Role.CAFETARIA, "COMPLET")).rejects.toThrow(ForbiddenException);
    expect(storage.urlSigneeGuide).not.toHaveBeenCalled();
  });

  it("refuse un nom de guide inconnu", async () => {
    const { s } = service();
    await expect(s.lienPourRole(Role.PATRON, "../rapports")).rejects.toThrow(NotFoundException);
  });

  it("donne un lien de 5 minutes vers la DERNIÈRE version", async () => {
    const { s, storage } = service();
    const r = await s.lienPourRole(Role.RECEPTIONNISTE, "RECEPTION");
    expect(r).toEqual({ url: "https://stockage/lien-signe", expireDans: 300 });
    expect(storage.urlSigneeGuide).toHaveBeenCalledWith(`RECEPTION/${UUID}.pdf`, 300, "Guide-HotelSaver-reception.pdf");
  });
});

describe("GuidesService — publication", () => {
  it("prépare un chemin choisi par le serveur", async () => {
    const { s } = service();
    const r = await s.preparerEnvoi("CAFETERIA");
    expect(r.chemin).toMatch(/^CAFETERIA\/[0-9a-f-]{36}\.pdf$/);
    expect(r.urlEnvoi).toBe("https://stockage/envoi");
  });

  it("refuse un chemin qui n'appartient pas au guide ou n'a pas la bonne forme", async () => {
    const { s } = service();
    await expect(s.publier("PATRON", `RECEPTION/${UUID}.pdf`, undefined, "sa-1")).rejects.toThrow(BadRequestException);
    await expect(s.publier("PATRON", "PATRON/../../rapports/x.pdf", undefined, "sa-1")).rejects.toThrow(BadRequestException);
  });

  it("refuse la publication si le fichier n'a pas été reçu", async () => {
    const { s, storage } = service();
    storage.tailleGuide.mockResolvedValueOnce(null);
    await expect(s.publier("PATRON", `PATRON/${UUID}.pdf`, undefined, "sa-1")).rejects.toThrow(BadRequestException);
  });

  it("crée la version suivante avec la taille réelle du fichier", async () => {
    const { s, prisma } = service();
    await s.publier("RECEPTION", `RECEPTION/${UUID}.pdf`, " Édition 1.1 ", "sa-1");
    expect(prisma.guideUtilisation.create).toHaveBeenCalledWith({
      data: { guide: "RECEPTION", version: 3, fichier: `RECEPTION/${UUID}.pdf`, taille: 12345, edition: "Édition 1.1", publiePar: "sa-1" },
    });
  });
});
