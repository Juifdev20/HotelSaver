import { Role } from "@hotel-chicago/types";
import { TauxChangeService } from "./taux-change.service";

const HOTEL_ID = "hotel-1";
const patron = { userId: "u1", supabaseAuthId: "a1", role: Role.PATRON, nom: "P", hotelId: HOTEL_ID };

describe("TauxChangeService", () => {
  let prisma: { tauxChange: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock } };
  let service: TauxChangeService;

  beforeEach(() => {
    prisma = { tauxChange: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() } };
    service = new TauxChangeService(prisma as any);
  });

  it("actuel renvoie la ligne la plus récente de l'hôtel, null si aucune", async () => {
    prisma.tauxChange.findFirst.mockResolvedValue(null);
    expect(await service.actuel(HOTEL_ID)).toBeNull();
    expect(prisma.tauxChange.findFirst).toHaveBeenCalledWith({
      where: { hotelId: HOTEL_ID },
      orderBy: { createdAt: "desc" },
    });
  });

  it("create écrit une nouvelle ligne horodatée, jamais un update", async () => {
    prisma.tauxChange.create.mockResolvedValue({ id: "t1" });
    await service.create({ cdfParUsd: 2850 }, patron);
    expect(prisma.tauxChange.create).toHaveBeenCalledWith({
      data: { hotelId: HOTEL_ID, cdfParUsd: 2850, definiPar: "u1" },
    });
  });
});
