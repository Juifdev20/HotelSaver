import { LinkPayClient } from "./linkpay.client";

/** Adresse de ScanLinkPay (19/10/2026) : en production, LINKPAY_API_URL avait été saisie sans « /api/v1 » et chaque appel
 * recevait « Cannot GET ». Les acomptes d'un hôtel ne doivent pas non plus dépendre du numéro marchand de la plateforme. */
describe("LinkPayClient — adresse", () => {
  const avant = { ...process.env };
  afterEach(() => {
    process.env = { ...avant };
    jest.restoreAllMocks();
  });

  async function urlAppelee(adresse: string): Promise<string> {
    process.env.LINKPAY_API_URL = adresse;
    delete process.env.LINKPAY_NUMERO_MARCHAND;
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ business: "Hôtel X", platform_fee_cents: 0, psp_fee_cents: 0, total_cents: 100, net_cents: 100, amount_cents: 100 }), { status: 200 })
    );
    await new LinkPayClient().apercuFrais({ marchand: { numero: "SLP-1" }, montantCentimes: 100, devise: "USD", modele: "MERCHANT_PAID" });
    return String(fetchMock.mock.calls[0][0]);
  }

  it("ajoute /api/v1 quand il manque, sans le doubler quand il est là", async () => {
    expect(await urlAppelee("https://linkpayapi.onrender.com")).toMatch(/^https:\/\/linkpayapi\.onrender\.com\/api\/v1\/payment-requests\/fees-preview\?/);
    expect(await urlAppelee("https://linkpayapi.onrender.com/api/v1/")).toMatch(/^https:\/\/linkpayapi\.onrender\.com\/api\/v1\/payment-requests\//);
  });

  it("vérifie le numéro d'un hôtel même sans numéro marchand de la plateforme", async () => {
    await expect(urlAppelee("https://linkpayapi.onrender.com/api/v1")).resolves.toContain("scanlinkpay_number=SLP-1");
  });
});
