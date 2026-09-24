import { connecterAvecMotDePasse, rafraichirSession } from "./supabase-auth";

function mockFetchOnce(ok: boolean, status: number, corps: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    status,
    json: () => Promise.resolve(corps),
  });
}

const config = { url: "https://xxx.supabase.co", anonKey: "anon-key" };

describe("connecterAvecMotDePasse", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.spyOn(Date, "now").mockReturnValue(1_000_000_000);
  });

  it("envoie l'email/mot de passe et la clé anon au bon endpoint Supabase", async () => {
    mockFetchOnce(true, 200, { access_token: "at", refresh_token: "rt", expires_in: 3600 });

    await connecterAvecMotDePasse(config, "a@b.com", "secret");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://xxx.supabase.co/auth/v1/token?grant_type=password",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "anon-key" }),
        body: JSON.stringify({ email: "a@b.com", password: "secret" }),
      })
    );
  });

  it("calcule expiresAt à partir de expires_in", async () => {
    mockFetchOnce(true, 200, { access_token: "at", refresh_token: "rt", expires_in: 3600 });

    const session = await connecterAvecMotDePasse(config, "a@b.com", "secret");

    expect(session).toEqual({ accessToken: "at", refreshToken: "rt", expiresAt: 1_000_000 + 3600 });
  });

  it("traduit un échec Supabase en message d'erreur clair", async () => {
    mockFetchOnce(false, 400, { error_description: "Invalid login credentials" });

    await expect(connecterAvecMotDePasse(config, "a@b.com", "mauvais")).rejects.toThrow(
      "Invalid login credentials"
    );
  });

  it("donne un message par défaut si Supabase ne fournit aucun détail", async () => {
    mockFetchOnce(false, 400, {});
    await expect(connecterAvecMotDePasse(config, "a@b.com", "mauvais")).rejects.toThrow(
      "Email ou mot de passe incorrect."
    );
  });
});

describe("rafraichirSession", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("envoie le refresh_token au bon grant_type", async () => {
    mockFetchOnce(true, 200, { access_token: "at2", refresh_token: "rt2", expires_in: 3600 });

    await rafraichirSession(config, "ancien-refresh-token");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://xxx.supabase.co/auth/v1/token?grant_type=refresh_token",
      expect.objectContaining({ body: JSON.stringify({ refresh_token: "ancien-refresh-token" }) })
    );
  });
});
