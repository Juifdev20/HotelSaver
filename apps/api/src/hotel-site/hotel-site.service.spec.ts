import { BadRequestException } from "@nestjs/common";
import { HotelSiteService } from "./hotel-site.service";
import { prefixeUrlHotel } from "../common/supabase-storage/urls-hotel";

const HOTEL_ID = "hotel-1";

function creer() {
  const prisma = {
    hotel: { findUnique: jest.fn(), update: jest.fn().mockReturnValue("maj-hotel") },
    hotelSite: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockReturnValue("maj-site") },
    $transaction: jest.fn().mockResolvedValue([]),
  } as any;
  prisma.hotel.findUnique.mockResolvedValue({ nom: "Hôtel Test", sousDomaine: "hotel-test", adresse: "Goma", telephoneContact: null, emailContact: null, site: null });
  const stockage = { supprimerImage: jest.fn().mockResolvedValue(undefined) } as any;
  return { prisma, stockage, service: new HotelSiteService(prisma, stockage) };
}

describe("HotelSiteService", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://exemple.supabase.co";
  });

  it("obtenir() renvoie des valeurs par défaut quand aucun site n'est encore défini", async () => {
    const { service } = creer();
    const site = await service.obtenir(HOTEL_ID);
    expect(site).toMatchObject({ nom: "Hôtel Test", adresse: "Goma", galerie: [], services: [], reception24h: false, reseaux: {} });
  });

  it("modifier() écrit les coordonnées sur Hotel et le contenu sur HotelSite dans une transaction", async () => {
    const { service, prisma } = creer();
    await service.modifier(HOTEL_ID, { adresse: "Kasindi", slogan: "Bienvenue" });
    expect(prisma.hotel.update).toHaveBeenCalledWith({ where: { id: HOTEL_ID }, data: { adresse: "Kasindi" } });
    expect(prisma.hotelSite.upsert).toHaveBeenCalledWith({
      where: { hotelId: HOTEL_ID },
      create: { hotelId: HOTEL_ID, slogan: "Bienvenue" },
      update: { slogan: "Bienvenue" },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("refuse une image qui n'est pas dans le stockage de l'hôtel", async () => {
    const { service, prisma } = creer();
    await expect(service.modifier(HOTEL_ID, { couvertureUrl: "https://exemple.com/x.jpg" })).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuse un réseau inconnu ou un lien sans http(s)", async () => {
    const { service } = creer();
    await expect(service.modifier(HOTEL_ID, { reseaux: { myspace: "https://x.com" } })).rejects.toThrow(BadRequestException);
    await expect(service.modifier(HOTEL_ID, { reseaux: { facebook: "facebook.com/hotel" } })).rejects.toThrow(BadRequestException);
  });

  it("supprime du stockage les images retirées de la galerie et l'ancienne couverture", async () => {
    const { service, prisma, stockage } = creer();
    const p = prefixeUrlHotel(HOTEL_ID);
    prisma.hotelSite.findUnique.mockResolvedValue({ couvertureUrl: `${p}aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.webp`, galerie: [`${p}bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.webp`, `${p}bbbbbbbb-2222-4222-8222-bbbbbbbbbbbc.webp`] });
    await service.modifier(HOTEL_ID, { couvertureUrl: `${p}cccccccc-3333-4333-8333-cccccccccccc.webp`, galerie: [`${p}bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.webp`] });
    expect(stockage.supprimerImage).toHaveBeenCalledWith(HOTEL_ID, `${p}aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.webp`);
    expect(stockage.supprimerImage).toHaveBeenCalledWith(HOTEL_ID, `${p}bbbbbbbb-2222-4222-8222-bbbbbbbbbbbc.webp`);
    expect(stockage.supprimerImage).toHaveBeenCalledTimes(2);
  });
});
