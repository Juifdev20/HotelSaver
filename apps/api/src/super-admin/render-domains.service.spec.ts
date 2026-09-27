import { InternalServerErrorException } from "@nestjs/common";
import { RenderDomainsService } from "./render-domains.service";

describe("RenderDomainsService", () => {
  const ancienFetch = global.fetch;
  const ancienEnv = { ...process.env };

  beforeEach(() => {
    process.env.RENDER_API_KEY = "cle-test";
    process.env.RENDER_WEB_SERVICE_ID = "srv-test";
  });

  afterEach(() => {
    global.fetch = ancienFetch;
    process.env = { ...ancienEnv };
  });

  it("lève InternalServerErrorException si RENDER_API_KEY/RENDER_WEB_SERVICE_ID sont absents", async () => {
    delete process.env.RENDER_API_KEY;
    delete process.env.RENDER_WEB_SERVICE_ID;
    const service = new RenderDomainsService();
    await expect(service.ajouterDomaine("hotel-chicago.com")).rejects.toThrow(InternalServerErrorException);
  });

  describe("ajouterDomaine", () => {
    it("renvoie id/name/verifie pour un sous-domaine (réponse Render en un seul objet)", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "cd-1", name: "www.hotel-chicago.com", verificationStatus: "unverified" }),
      }) as any;

      const service = new RenderDomainsService();
      const resultat = await service.ajouterDomaine("www.hotel-chicago.com");

      expect(resultat).toEqual({ id: "cd-1", name: "www.hotel-chicago.com", verifie: false });
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.render.com/v1/services/srv-test/custom-domains",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "www.hotel-chicago.com" }) })
      );
    });

    it("pour un domaine apex, ne garde que l'entrée exacte parmi le tableau renvoyé (avec son www. associé)", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: "cd-2", name: "www.hotel-chicago.com", verificationStatus: "unverified", redirectForName: "hotel-chicago.com" },
            { id: "cd-1", name: "hotel-chicago.com", verificationStatus: "verified" },
          ]),
      }) as any;

      const service = new RenderDomainsService();
      const resultat = await service.ajouterDomaine("hotel-chicago.com");

      expect(resultat).toEqual({ id: "cd-1", name: "hotel-chicago.com", verifie: true });
    });

    it("convertit un refus Render en InternalServerErrorException avec le message d'origine", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: "Domain already in use by another service" }),
      }) as any;

      const service = new RenderDomainsService();
      await expect(service.ajouterDomaine("deja-pris.com")).rejects.toThrow(
        /Domain already in use by another service/
      );
    });
  });

  describe("supprimerDomaine", () => {
    it("appelle DELETE sur l'id fourni", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) }) as any;
      const service = new RenderDomainsService();
      await service.supprimerDomaine("cd-1");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.render.com/v1/services/srv-test/custom-domains/cd-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("un domaine déjà absent côté Render (404) n'est pas une erreur (idempotent)", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as any;
      const service = new RenderDomainsService();
      await expect(service.supprimerDomaine("cd-disparu")).resolves.toBeUndefined();
    });
  });

  describe("statutDomaine", () => {
    it("retrouve le domaine par id dans la liste renvoyée par Render", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: "cd-autre", name: "autre.com", verificationStatus: "verified" },
            { id: "cd-1", name: "hotel-chicago.com", verificationStatus: "verified" },
          ]),
      }) as any;

      const service = new RenderDomainsService();
      const resultat = await service.statutDomaine("cd-1");

      expect(resultat).toEqual({ id: "cd-1", name: "hotel-chicago.com", verifie: true });
    });

    it("renvoie null si l'id n'est plus dans la liste Render", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }) as any;
      const service = new RenderDomainsService();
      await expect(service.statutDomaine("cd-disparu")).resolves.toBeNull();
    });
  });
});
