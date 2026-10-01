import { NotificationsSchedulerService, bornesDuJour } from "./notifications-scheduler.service";

function creer() {
  const prisma = {
    hotel: { findMany: jest.fn().mockResolvedValue([{ id: "hotel-A" }, { id: "hotel-B" }]) },
    reservation: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  } as any;
  const notifications = { emettre: jest.fn().mockResolvedValue(undefined) } as any;
  const dashboard = { recetteDuJour: jest.fn() } as any;
  return { prisma, notifications, dashboard, service: new NotificationsSchedulerService(prisma, notifications, dashboard) };
}

describe("bornesDuJour (Africa/Lubumbashi, UTC+2)", () => {
  it("00:30 locale = 22:30 UTC la veille : la journée locale commence à 22:00 UTC", () => {
    const { debut, fin, cle } = bornesDuJour(new Date("2026-10-01T22:30:00Z"));
    expect(cle).toBe("2026-10-02");
    expect(debut.toISOString()).toBe("2026-10-01T22:00:00.000Z");
    expect(fin.toISOString()).toBe("2026-10-02T22:00:00.000Z");
  });
});

describe("NotificationsSchedulerService", () => {
  it("arrivées/départs : une alerte par hôtel concerné, rien s'il n'y a ni arrivée ni départ", async () => {
    const { service, prisma, notifications } = creer();
    prisma.reservation.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where.hotelId === "hotel-A" ? (where.statut === "EN_COURS" ? 2 : 3) : 0)
    );
    await service.arriveesEtDeparts(new Date("2026-10-01T05:00:00Z"));
    expect(notifications.emettre).toHaveBeenCalledTimes(1);
    expect(notifications.emettre).toHaveBeenCalledWith(
      expect.objectContaining({
        hotelId: "hotel-A",
        roles: ["RECEPTIONNISTE", "PATRON"],
        cleDedup: "arrivees:2026-10-01",
        corps: "3 arrivées et 2 départs aujourd'hui",
      })
    );
  });

  it("départs dépassés : dédoublonné par réservation et limité à l'hôtel de la réservation", async () => {
    const { service, prisma, notifications } = creer();
    prisma.reservation.findMany.mockResolvedValue([
      { id: "r1", hotelId: "hotel-B", dateDepart: new Date("2026-10-01T09:00:00Z"), client: { nom: "M. Kabila" }, chambre: { numero: "105" } },
    ]);
    await service.departsDepasses(new Date("2026-10-01T10:00:00Z"));
    expect(notifications.emettre).toHaveBeenCalledWith(expect.objectContaining({ hotelId: "hotel-B", cleDedup: "depart:r1", type: "DEPART_DEPASSE" }));
  });

  it("récap du soir : patron uniquement, avec la recette de SON hôtel, et rien si la recette est nulle", async () => {
    const { service, dashboard, notifications } = creer();
    dashboard.recetteDuJour.mockImplementation((u: any) =>
      Promise.resolve({ total: u.hotelId === "hotel-A" ? { montantUSD: 120, montantCDF: 45000 } : { montantUSD: 0, montantCDF: 0 } })
    );
    await service.recapDuSoir(new Date("2026-10-01T18:00:00Z"));
    expect(dashboard.recetteDuJour).toHaveBeenCalledWith(expect.objectContaining({ hotelId: "hotel-A", role: "PATRON" }));
    expect(notifications.emettre).toHaveBeenCalledTimes(1);
    expect(notifications.emettre).toHaveBeenCalledWith(
      expect.objectContaining({ hotelId: "hotel-A", roles: ["PATRON"], corps: "Recette : 120.00 $ · 45 000 FC" })
    );
  });

  it("un hôtel en échec n'empêche pas les suivants", async () => {
    const { service, dashboard, notifications } = creer();
    dashboard.recetteDuJour.mockImplementation((u: any) =>
      u.hotelId === "hotel-A" ? Promise.reject(new Error("boom")) : Promise.resolve({ total: { montantUSD: 10, montantCDF: 0 } })
    );
    await service.recapDuSoir(new Date("2026-10-01T18:00:00Z"));
    expect(notifications.emettre).toHaveBeenCalledWith(expect.objectContaining({ hotelId: "hotel-B" }));
  });

  it("licence : prévient dans les 7 derniers jours seulement", async () => {
    const { service, prisma, notifications } = creer();
    const maintenant = new Date("2026-10-01T06:00:00Z");
    const dans = (jours: number) => new Date(maintenant.getTime() + jours * 86400000 - 3600000);
    prisma.hotel.findMany.mockResolvedValue([
      { id: "h3", createdAt: new Date("2020-01-01"), paiementsLicence: [{ periodeCouverteJusquau: dans(3) }] },
      { id: "h30", createdAt: new Date("2020-01-01"), paiementsLicence: [{ periodeCouverteJusquau: dans(30) }] },
    ]);
    await service.licencesBientotExpirees(maintenant);
    expect(notifications.emettre).toHaveBeenCalledTimes(1);
    expect(notifications.emettre).toHaveBeenCalledWith(expect.objectContaining({ hotelId: "h3", roles: ["PATRON"], type: "LICENCE_BIENTOT_EXPIREE" }));
  });
});
