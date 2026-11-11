import { MisesAJourService } from "./mises-a-jour.service";

const release = (surcharge: object = {}) => ({
  tag_name: "v1.0.11",
  published_at: "2026-11-12T08:00:00Z",
  assets: [{ name: "HotelSaver-1.0.11.apk", browser_download_url: "https://exemple/HotelSaver-1.0.11.apk", size: 5 }],
  ...surcharge,
});
const creer = () => {
  const notifications = { annoncerMiseAJour: jest.fn().mockResolvedValue({ hotels: 2, appareils: 5 }) };
  return { notifications, service: new MisesAJourService(notifications as never) };
};
const LENDEMAIN = new Date("2026-11-13T08:00:00Z");

describe("MisesAJourService.annonceSiNouvelle", () => {
  it("annonce la version d'une release récente avec son APK", async () => {
    const { service, notifications } = creer();
    expect(await service.annonceSiNouvelle(async () => release(), LENDEMAIN)).toBe("1.0.11");
    expect(notifications.annoncerMiseAJour).toHaveBeenCalledWith("1.0.11");
  });
  it("n'annonce pas une vieille release (premier démarrage du serveur)", async () => {
    const { service, notifications } = creer();
    expect(await service.annonceSiNouvelle(async () => release(), new Date("2026-12-30T08:00:00Z"))).toBeNull();
    expect(notifications.annoncerMiseAJour).not.toHaveBeenCalled();
  });
  it("n'annonce rien sans APK, pour un brouillon, une pré-version ou un tag illisible", async () => {
    const { service, notifications } = creer();
    for (const r of [release({ assets: [] }), release({ draft: true }), release({ prerelease: true }), release({ tag_name: "bientot" }), null]) {
      expect(await service.annonceSiNouvelle(async () => r, LENDEMAIN)).toBeNull();
    }
    expect(notifications.annoncerMiseAJour).not.toHaveBeenCalled();
  });
  it("ne lève jamais quand GitHub est injoignable", async () => {
    const { service } = creer();
    expect(await service.annonceSiNouvelle(async () => { throw new Error("réseau"); }, LENDEMAIN)).toBeNull();
  });
});
