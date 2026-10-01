import { ReglagesHotelService } from "./reglages-hotel.service";

describe("ReglagesHotelService", () => {
  it("modifie le réglage de l'hôtel du JWT uniquement et renvoie la nouvelle valeur", async () => {
    const prisma = { hotel: { update: jest.fn().mockResolvedValue({ patronPeutOperer: true }) } } as any;
    const service = new ReglagesHotelService(prisma);

    const resultat = await service.modifier("hotel-A", { patronPeutOperer: true });

    expect(resultat).toEqual({ patronPeutOperer: true });
    expect(prisma.hotel.update).toHaveBeenCalledWith({
      where: { id: "hotel-A" },
      data: { patronPeutOperer: true },
      select: { patronPeutOperer: true },
    });
  });
});
