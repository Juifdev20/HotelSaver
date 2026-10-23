import { ErreurLinkPay, LinkPayClient } from "./linkpay.client";

const reponse = (statut: number, corps: unknown) => ({ ok: statut < 400, status: statut, json: async () => corps }) as unknown as Response;

describe("LinkPayClient : compte marchand de la plateforme inconnu de ScanLinkPay", () => {
  const avant = { ...process.env };
  afterEach(() => {
    process.env = { ...avant };
    jest.restoreAllMocks();
  });

  function client() {
    process.env.LINKPAY_API_URL = "https://linkpayapi.example.test";
    process.env.LINKPAY_NUMERO_MARCHAND = "SLP-000999";
    return new LinkPayClient();
  }

  it("dit au patron que le réglage est à corriger (pas « numéro introuvable », qui lui ferait croire que c'est son numéro)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(reponse(404, { message: "Numéro ScanLinkPay introuvable", error: "Not Found", statusCode: 404 }));
    const err: ErreurLinkPay = await client().creerDemande({ montantCentimes: 5000, devise: "USD" }).catch((e) => e);
    expect(err).toBeInstanceOf(ErreurLinkPay);
    expect(err.affichable).toBe(true);
    expect(err.message).toMatch(/compte HotelSaver n'est pas reconnu/);
    expect(err.message).not.toMatch(/introuvable/i);
  });

  it("garde le message d'origine pour le numéro d'un HÔTEL (le patron peut le corriger lui-même)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(reponse(404, { message: "Numéro ScanLinkPay introuvable", statusCode: 404 }));
    const err: ErreurLinkPay = await client().creerDemande({ marchand: { numero: "SLP-000123" }, montantCentimes: 5000, devise: "USD" }).catch((e) => e);
    expect(err.message).toMatch(/introuvable/i);
  });
});
