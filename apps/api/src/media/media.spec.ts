import { BadRequestException } from "@nestjs/common";
import sharp from "sharp";
import { traiterImage } from "./traiter-image";
import { verifierUrlsHotel, prefixeUrlHotel } from "../common/supabase-storage/urls-hotel";
import { MediaService } from "./media.service";

async function imageTest(largeur: number, hauteur: number, format: "jpeg" | "png" = "jpeg"): Promise<Buffer> {
  return sharp({ create: { width: largeur, height: hauteur, channels: 3, background: { r: 30, g: 120, b: 220 } } })
    [format]()
    .toBuffer();
}

describe("traiterImage", () => {
  it("réduit une grande photo dans le cadre chambre et la convertit en WebP", async () => {
    const source = await imageTest(4000, 3000);
    const sortie = await traiterImage(source, "chambre");
    const meta = await sharp(sortie).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBeLessThanOrEqual(1280);
    expect(meta.height).toBeLessThanOrEqual(960);
    expect(sortie.length).toBeLessThan(source.length);
  });

  it("n'agrandit jamais une petite image", async () => {
    const meta = await sharp(await traiterImage(await imageTest(400, 300, "png"), "chambre")).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it("accepte un cadre plus large pour la couverture", async () => {
    const meta = await sharp(await traiterImage(await imageTest(3000, 1500), "couverture")).metadata();
    expect(meta.width).toBe(1920);
  });

  it("rejette un fichier qui n'est pas une image (400)", async () => {
    await expect(traiterImage(Buffer.from("ceci n'est pas une image"), "chambre")).rejects.toThrow(BadRequestException);
  });
});

describe("verifierUrlsHotel", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://exemple.supabase.co";
  });

  it("accepte les URLs du stockage de l'hôtel, ignore les valeurs vides", () => {
    const url = `${prefixeUrlHotel("hotel-1")}aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.webp`;
    expect(() => verifierUrlsHotel([url, null, undefined], "hotel-1")).not.toThrow();
  });

  it("refuse l'URL d'un autre hôtel et une URL externe", () => {
    expect(() => verifierUrlsHotel([`${prefixeUrlHotel("hotel-2")}aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.webp`], "hotel-1")).toThrow(BadRequestException);
    expect(() => verifierUrlsHotel(["https://exemple.com/image.jpg"], "hotel-1")).toThrow(BadRequestException);
  });
});

describe("MediaService", () => {
  it("traite puis envoie l'image et renvoie son URL", async () => {
    const stockage = { envoyerImage: jest.fn().mockResolvedValue("https://x/hotel-1/a.webp"), supprimerImage: jest.fn() };
    const service = new MediaService(stockage as any);
    const resultat = await service.envoyerImage("hotel-1", await imageTest(2000, 1500), "chambre");
    expect(resultat).toEqual({ url: "https://x/hotel-1/a.webp" });
    const envoye: Buffer = stockage.envoyerImage.mock.calls[0][1];
    expect((await sharp(envoye).metadata()).format).toBe("webp");
  });

  it("ne supprime pas l'image d'un autre hôtel", async () => {
    process.env.SUPABASE_URL = "https://exemple.supabase.co";
    const stockage = { envoyerImage: jest.fn(), supprimerImage: jest.fn() };
    const service = new MediaService(stockage as any);
    await expect(service.supprimerImage("hotel-1", `${prefixeUrlHotel("hotel-2")}bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.webp`)).rejects.toThrow(BadRequestException);
    expect(stockage.supprimerImage).not.toHaveBeenCalled();
  });
});
