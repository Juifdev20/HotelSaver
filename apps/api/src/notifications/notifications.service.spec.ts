import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@hotel-chicago/database";
import { NotificationsService, type EmissionNotification } from "./notifications.service";
import { messages } from "./messages";

const PATRON = { userId: "u-patron", supabaseAuthId: "a1", role: "PATRON", nom: "Patron", hotelId: "hotel-A" } as any;
const CAFETARIA = { userId: "u-caf", supabaseAuthId: "a2", role: "CAFETARIA", nom: "Cafet", hotelId: "hotel-A" } as any;
const AUTRE_HOTEL = { userId: "u-b", supabaseAuthId: "a3", role: "PATRON", nom: "Patron B", hotelId: "hotel-B" } as any;

function creer() {
  const prisma = {
    notification: {
      create: jest.fn().mockResolvedValue({ id: "n-1" }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: "n-1" }),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    notificationLue: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    appareilPush: {
      findMany: jest.fn().mockResolvedValue([{ jeton: "jeton-1" }, { jeton: "jeton-2" }]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as any;
  const push = { envoyer: jest.fn().mockResolvedValue({ envoyes: 2, invalides: [] }) } as any;
  return { prisma, push, service: new NotificationsService(prisma, push) };
}

const emission = (surcharge: Partial<EmissionNotification> = {}): EmissionNotification => ({
  hotelId: "hotel-A",
  roles: ["CAFETARIA", "PATRON"] as any,
  ...messages.stockBas({ produit: "Coca-Cola", stock: 3, produitId: "p-1" }),
  ...surcharge,
});

describe("NotificationsService.emettre", () => {
  it("enregistre la notification pour CET hôtel et ces rôles, puis envoie le push aux appareils de cet hôtel dont le rôle est ciblé", async () => {
    const { service, prisma, push } = creer();
    await service.emettre(emission());

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ hotelId: "hotel-A", roles: ["CAFETARIA", "PATRON"], type: "STOCK_BAS", lien: { ecran: "stock", id: "p-1" } }),
    });
    // Isolation : seuls les appareils de l'hôtel émetteur, des rôles ciblés, de comptes actifs.
    expect(prisma.appareilPush.findMany).toHaveBeenCalledWith({
      where: { hotelId: "hotel-A", actif: true, utilisateur: { actif: true, role: { in: ["CAFETARIA", "PATRON"] } } },
      select: { jeton: true },
    });
    expect(push.envoyer).toHaveBeenCalledWith(["jeton-1", "jeton-2"], expect.objectContaining({ id: "n-1", titre: "Stock bas" }));
  });

  it("n'envoie rien (et n'échoue pas) si aucun appareil n'est enregistré", async () => {
    const { service, prisma, push } = creer();
    prisma.appareilPush.findMany.mockResolvedValue([]);
    await expect(service.emettre(emission())).resolves.toBeUndefined();
    expect(push.envoyer).not.toHaveBeenCalled();
  });

  it("ignore silencieusement une alerte déjà émise (clé de déduplication)", async () => {
    const { service, prisma, push } = creer();
    prisma.notification.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("doublon", { code: "P2002", clientVersion: "7" }));
    await service.emettre(emission({ cleDedup: "depart:r-1" }));
    expect(push.envoyer).not.toHaveBeenCalled();
  });

  it("ne lève JAMAIS : une panne de base ou de push ne doit pas faire échouer l'action métier", async () => {
    const { service, prisma, push } = creer();
    prisma.notification.create.mockRejectedValue(new Error("base indisponible"));
    await expect(service.emettre(emission())).resolves.toBeUndefined();

    const b = creer();
    b.push.envoyer.mockRejectedValue(new Error("FCM hors service"));
    await expect(b.service.emettre(emission())).resolves.toBeUndefined();
    expect(push.envoyer).not.toHaveBeenCalled();
  });

  it("supprime de la base les jetons que Firebase déclare morts", async () => {
    const { service, prisma, push } = creer();
    push.envoyer.mockResolvedValue({ envoyes: 1, invalides: ["jeton-2"] });
    await service.emettre(emission());
    expect(prisma.appareilPush.deleteMany).toHaveBeenCalledWith({ where: { jeton: { in: ["jeton-2"] } } });
  });
});

describe("NotificationsService.lister / marquer — isolation par hôtel et par rôle", () => {
  it("ne lit que l'hôtel et le rôle de l'utilisateur (jamais ceux d'un autre)", async () => {
    const { service, prisma } = creer();
    await service.lister(CAFETARIA, {});
    const filtre = prisma.notification.findMany.mock.calls[0][0].where;
    expect(filtre).toMatchObject({ hotelId: "hotel-A", roles: { has: "CAFETARIA" } });

    await service.lister(AUTRE_HOTEL, {});
    expect(prisma.notification.findMany.mock.calls[1][0].where).toMatchObject({ hotelId: "hotel-B", roles: { has: "PATRON" } });
  });

  it("compte les non lues POUR cet utilisateur et renvoie `lue` par utilisateur", async () => {
    const { service, prisma } = creer();
    prisma.notification.count.mockResolvedValue(4);
    prisma.notification.findMany.mockResolvedValue([
      { id: "n-1", type: "STOCK_BAS", titre: "t", corps: "c", lien: { ecran: "stock" }, createdAt: new Date("2026-10-01T10:00:00Z"), lectures: [{ utilisateurId: "u-patron" }] },
      { id: "n-2", type: "STOCK_BAS", titre: "t", corps: "c", lien: { ecran: "stock" }, createdAt: new Date("2026-10-01T09:00:00Z"), lectures: [] },
    ]);
    const liste = await service.lister(PATRON, { limite: 10 });
    expect(prisma.notification.count.mock.calls[0][0].where).toMatchObject({ hotelId: "hotel-A", lectures: { none: { utilisateurId: "u-patron" } } });
    expect(liste.nonLues).toBe(4);
    expect(liste.notifications.map((n) => n.lue)).toEqual([true, false]);
  });

  it("applique le curseur `depuis` et plafonne la limite à 100", async () => {
    const { service, prisma } = creer();
    await service.lister(PATRON, { depuis: "2026-10-01T10:00:00.000Z", limite: 5000 });
    const appel = prisma.notification.findMany.mock.calls[0][0];
    expect(appel.where.createdAt).toEqual({ gt: new Date("2026-10-01T10:00:00.000Z") });
    expect(appel.take).toBe(100);
  });

  it("refuse (404) de marquer lue la notification d'un autre hôtel ou d'un autre rôle", async () => {
    const { service, prisma } = creer();
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(service.marquerLue(AUTRE_HOTEL, "n-1")).rejects.toThrow(NotFoundException);
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: { id: "n-1", hotelId: "hotel-B", roles: { has: "PATRON" } },
      select: { id: true },
    });
    expect(prisma.notificationLue.createMany).not.toHaveBeenCalled();
  });

  it("« tout marquer comme lu » ne touche que les non lues de l'utilisateur", async () => {
    const { service, prisma } = creer();
    prisma.notification.findMany.mockResolvedValue([{ id: "n-1" }, { id: "n-2" }]);
    await service.marquerToutesLues(CAFETARIA);
    expect(prisma.notification.findMany.mock.calls[0][0].where).toMatchObject({
      hotelId: "hotel-A",
      roles: { has: "CAFETARIA" },
      lectures: { none: { utilisateurId: "u-caf" } },
    });
    expect(prisma.notificationLue.createMany).toHaveBeenCalledWith({
      data: [{ notificationId: "n-1", utilisateurId: "u-caf" }, { notificationId: "n-2", utilisateurId: "u-caf" }],
      skipDuplicates: true,
    });
  });
});

describe("NotificationsService — appareils (téléphone partagé)", () => {
  it("un jeton déjà connu change de propriétaire au nom de l'utilisateur connecté", async () => {
    const { service, prisma } = creer();
    await service.enregistrerAppareil(CAFETARIA, "jeton-x", "android");
    const appel = prisma.appareilPush.upsert.mock.calls[0][0];
    expect(appel.where).toEqual({ jeton: "jeton-x" });
    expect(appel.create).toMatchObject({ utilisateurId: "u-caf", hotelId: "hotel-A" });
    expect(appel.update).toMatchObject({ utilisateurId: "u-caf", hotelId: "hotel-A", actif: true });
  });

  it("ne retire que les jetons de SON hôtel", async () => {
    const { service, prisma } = creer();
    await service.retirerAppareil(PATRON, "jeton-x");
    expect(prisma.appareilPush.deleteMany).toHaveBeenCalledWith({ where: { jeton: "jeton-x", hotelId: "hotel-A" } });
  });
});

describe("messages — textes en français", () => {
  it("demande de réservation : nom du client, chambre et dates", () => {
    const m = messages.demandeReservation({ client: "Jean Mukendi", chambre: "102", arrivee: new Date("2026-10-12T12:00:00Z"), depart: new Date("2026-10-14T12:00:00Z"), reservationId: "r-1" });
    expect(m.titre).toBe("Nouvelle demande de réservation");
    expect(m.corps).toContain("Jean Mukendi");
    expect(m.corps).toContain("Ch. 102");
    expect(m.corps).toMatch(/12 oct\.? → 14 oct\.?/);
    expect(m.lien).toEqual({ ecran: "reservations", id: "r-1" });
  });

  it("stock : décimales utiles seulement, et lien vers le produit", () => {
    expect(messages.stockBas({ produit: "Sucre", stock: "2.50", produitId: "p" }).corps).toBe("Sucre : plus que 2,5 en stock");
    expect(messages.stockBas({ produit: "Coca", stock: "3.000", produitId: "p" }).corps).toBe("Coca : plus que 3 en stock");
    expect(messages.stockEpuise({ produit: "Coca", produitId: "p" })).toMatchObject({ type: "STOCK_EPUISE", corps: "Coca est épuisé" });
  });

  it("arrivées/départs : accords singulier/pluriel et rien d'inutile", () => {
    expect(messages.arriveesDuJour({ arrivees: 3, departs: 2 }).corps).toBe("3 arrivées et 2 départs aujourd'hui");
    expect(messages.arriveesDuJour({ arrivees: 1, departs: 0 }).corps).toBe("1 arrivée aujourd'hui");
  });

  it("récap et licence", () => {
    expect(messages.recapQuotidien({ usd: 120, cdf: 45000 }).corps).toBe("Recette : 120.00 $ · 45 000 FC");
    expect(messages.licenceBientotExpiree({ jours: 1 }).corps).toContain("1 jour");
    expect(messages.licenceBientotExpiree({ jours: 7 }).corps).toContain("7 jours");
  });
});
