import { ErreurApi } from "./client";
import { connecterAvecMotDePasse, connecterViaApi, rafraichirAvecSecours, rafraichirSession, sessionRefusee } from "./supabase-auth";

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

  it("traduit en français la vraie réponse Supabase à un mauvais mot de passe (jamais l'anglais brut)", async () => {
    // Réponse réelle observée : {"code":400,"error_code":"invalid_credentials","msg":"Invalid login credentials"}
    mockFetchOnce(false, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });

    const promesse = connecterAvecMotDePasse(config, "a@b.com", "mauvais");
    await expect(promesse).rejects.toThrow("Numéro (ou e-mail) ou mot de passe incorrect.");
  });

  it("donne un message français par défaut si Supabase ne fournit aucun code connu", async () => {
    mockFetchOnce(false, 400, {});
    await expect(connecterAvecMotDePasse(config, "a@b.com", "mauvais")).rejects.toThrow(
      "Numéro (ou e-mail) ou mot de passe incorrect."
    );
  });

  it("explique un compte désactivé en français", async () => {
    mockFetchOnce(false, 400, { error_code: "user_banned", msg: "User is banned" });
    await expect(connecterAvecMotDePasse(config, "a@b.com", "x")).rejects.toThrow(
      "Ce compte a été désactivé. Contactez le patron."
    );
  });

  it("explique une coupure internet au lieu d'une erreur technique brute", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(connecterAvecMotDePasse(config, "a@b.com", "x")).rejects.toThrow(
      /Impossible de joindre le serveur de connexion/
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

describe("connecterViaApi (connexion par numéro, 15/10/2026)", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.spyOn(Date, "now").mockReturnValue(1_000_000_000);
  });

  it("envoie `telephone` au relais quand l'identifiant est un numéro", async () => {
    mockFetchOnce(true, 200, { access_token: "at", refresh_token: "rt", expires_in: 3600 });
    await connecterViaApi(["http://api.test"], "+243970000000", "secret");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.test/auth/connexion",
      expect.objectContaining({ body: JSON.stringify({ telephone: "+243970000000", motDePasse: "secret" }) })
    );
  });

  it("envoie `email` au relais pour un ancien compte (identifiant avec @)", async () => {
    mockFetchOnce(true, 200, { access_token: "at", refresh_token: "rt", expires_in: 3600 });
    await connecterViaApi(["http://api.test"], "a@b.com", "secret");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.test/auth/connexion",
      expect.objectContaining({ body: JSON.stringify({ email: "a@b.com", motDePasse: "secret" }) })
    );
  });
});

describe("sessions longues (12/11/2026) : seul un vrai refus du serveur met fin à la session", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("sessionRefusee : 400, 401, 403 = refus ; réseau coupé, 429 et 5xx = session intacte", () => {
    for (const code of [400, 401, 403]) expect(sessionRefusee(new ErreurApi(code, "x"))).toBe(true);
    for (const code of [0, 404, 429, 500, 502, 503, 504]) expect(sessionRefusee(new ErreurApi(code, "x"))).toBe(false);
    expect(sessionRefusee(new Error("autre"))).toBe(false);
  });

  it("rafraichirSession : un refus direct de Supabase est une ErreurApi (statut lisible)", async () => {
    mockFetchOnce(false, 400, { error_code: "refresh_token_already_used" });
    await expect(rafraichirSession(config, "rt")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rafraichirAvecSecours : relais en panne (502) → renouvellement direct auprès de Supabase", async () => {
    mockFetchOnce(false, 502, { message: "Bad Gateway" });
    mockFetchOnce(true, 200, { access_token: "at", refresh_token: "rt2", expires_in: 3600 });
    const session = await rafraichirAvecSecours(["https://api.test"], config, "rt");
    expect(session.refreshToken).toBe("rt2");
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain("supabase.co/auth/v1/token?grant_type=refresh_token");
  });

  it("rafraichirAvecSecours : un vrai refus du relais (400) n'est PAS rejoué en direct (jeton déjà consommé)", async () => {
    mockFetchOnce(false, 400, { error_code: "refresh_token_already_used" });
    await expect(rafraichirAvecSecours(["https://api.test"], config, "rt")).rejects.toMatchObject({ statusCode: 400 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
