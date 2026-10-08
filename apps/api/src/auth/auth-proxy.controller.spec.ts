import { BadGatewayException, HttpException } from "@nestjs/common";
import { AuthProxyController } from "./auth-proxy.controller";

describe("AuthProxyController", () => {
  const controleur = new AuthProxyController();
  let fetchOriginal: typeof fetch;

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_ANON_KEY = "cle-anon";
    fetchOriginal = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  function simulerSupabase(status: number, corps: unknown) {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } })
    ) as never;
  }

  it("transmet email/motDePasse à Supabase (grant_type=password) et renvoie le jeton", async () => {
    simulerSupabase(200, { access_token: "t", refresh_token: "r", expires_in: 3600 });
    const corps = await controleur.connexion({ email: "a@b.cd", motDePasse: "secret" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://supabase.test/auth/v1/token?grant_type=password",
      expect.objectContaining({ method: "POST" })
    );
    const init = (globalThis.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ email: "a@b.cd", password: "secret" });
    expect((init.headers as Record<string, string>).apikey).toBe("cle-anon");
    expect(corps).toEqual({ access_token: "t", refresh_token: "r", expires_in: 3600 });
  });

  it("rafraichir utilise grant_type=refresh_token avec le jeton", async () => {
    simulerSupabase(200, { access_token: "t2", refresh_token: "r2", expires_in: 3600 });
    await controleur.rafraichir({ refreshToken: "r1" });
    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://supabase.test/auth/v1/token?grant_type=refresh_token");
    expect(JSON.parse(init.body as string)).toEqual({ refresh_token: "r1" });
  });

  it("rejoue le statut et le corps Supabase en cas d'erreur (client → français)", async () => {
    simulerSupabase(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
    try {
      await controleur.connexion({ email: "x@y.z", motDePasse: "mauvais" });
      fail("doit jeter");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(400);
      expect((e as HttpException).getResponse()).toMatchObject({ error_code: "invalid_credentials" });
    }
  });

  it("BadGatewayException (502) quand Supabase est injoignable depuis l'API", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("réseau mort")) as never;
    await expect(controleur.connexion({ email: "a@b.cd", motDePasse: "x" })).rejects.toBeInstanceOf(BadGatewayException);
  });
});
