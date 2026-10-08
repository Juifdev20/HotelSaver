import { ReglagesHotelService } from "./reglages-hotel.service";

describe("ReglagesHotelService", () => {
  function prismaFactice() {
    return {
      hotel: { update: jest.fn().mockResolvedValue({ patronPeutOperer: true, cuisineActivee: false, commandeWebActivee: false }) },
      ligneCommande: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    } as any;
  }

  it("modifie le réglage de l'hôtel du JWT uniquement et renvoie les nouvelles valeurs", async () => {
    const prisma = prismaFactice();
    const service = new ReglagesHotelService(prisma);

    const resultat = await service.modifier("hotel-A", { patronPeutOperer: true });

    expect(resultat).toEqual({ patronPeutOperer: true, cuisineActivee: false, commandeWebActivee: false });
    expect(prisma.hotel.update).toHaveBeenCalledWith({
      where: { id: "hotel-A" },
      data: { patronPeutOperer: true },
      select: { patronPeutOperer: true, cuisineActivee: true, commandeWebActivee: true },
    });
    expect(prisma.ligneCommande.updateMany).not.toHaveBeenCalled();
  });

  it("ignore les champs absents du PATCH", async () => {
    const prisma = prismaFactice();
    const service = new ReglagesHotelService(prisma);

    await service.modifier("hotel-A", { cuisineActivee: true });

    expect(prisma.hotel.update).toHaveBeenCalledWith({
      where: { id: "hotel-A" },
      data: { cuisineActivee: true },
      select: { patronPeutOperer: true, cuisineActivee: true, commandeWebActivee: true },
    });
  });

  it("clot les lignes encore en file quand la cuisine est désactivée", async () => {
    const prisma = prismaFactice();
    const service = new ReglagesHotelService(prisma);

    await service.modifier("hotel-A", { cuisineActivee: false });

    expect(prisma.ligneCommande.updateMany).toHaveBeenCalledWith({
      where: { hotelId: "hotel-A", statut: { in: ["EN_ATTENTE", "EN_PREPARATION", "PRET"] } },
      data: { statut: "SERVI" },
    });
  });
});
