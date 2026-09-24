import { ClientApi, ErreurApi } from "./client";

function mockFetchOnce(status: number, corps: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(corps),
  });
}

describe("ClientApi", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("ajoute le jeton Bearer courant à chaque requête", async () => {
    mockFetchOnce(200, { userId: "u1", role: "PATRON", nom: "P" });
    const client = new ClientApi("http://localhost:3000", () => "mon-jeton");

    await client.moi();

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/auth/me",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer mon-jeton" }) })
    );
  });

  it("n'ajoute pas d'en-tête Authorization si aucun jeton n'est disponible", async () => {
    mockFetchOnce(200, {});
    const client = new ClientApi("http://localhost:3000", () => null);

    await client.moi();

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it("transforme une réponse d'erreur en ErreurApi avec le message du serveur", async () => {
    mockFetchOnce(403, { message: "Accès refusé pour le rôle CAFETARIA." });
    const client = new ClientApi("http://localhost:3000", () => "jeton");

    let erreurCapturee: unknown;
    try {
      await client.moi();
    } catch (erreur) {
      erreurCapturee = erreur;
    }

    expect(erreurCapturee).toBeInstanceOf(ErreurApi);
    expect((erreurCapturee as ErreurApi).message).toBe("Accès refusé pour le rôle CAFETARIA.");
    expect((erreurCapturee as ErreurApi).statusCode).toBe(403);
  });

  it("signale une coupure réseau avec statusCode 0 et un message français, pas 'Failed to fetch'", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const client = new ClientApi("http://localhost:3000", () => "jeton");

    let erreurCapturee: unknown;
    try {
      await client.moi();
    } catch (erreur) {
      erreurCapturee = erreur;
    }

    expect(erreurCapturee).toBeInstanceOf(ErreurApi);
    expect((erreurCapturee as ErreurApi).statusCode).toBe(0);
    expect((erreurCapturee as ErreurApi).message).toMatch(/Impossible de joindre le serveur/);
  });

  describe("estJoignable", () => {
    it("vrai quand c'est bien le serveur de l'hôtel qui répond", async () => {
      mockFetchOnce(200, { status: "ok", service: "hotel-chicago-api" });
      await expect(new ClientApi("http://x", () => null).estJoignable()).resolves.toBe(true);
    });

    it("faux quand un AUTRE service répond sur cette adresse (ex. un autre projet sur le port 3000)", async () => {
      mockFetchOnce(200, { status: "ok", uptime: 123 });
      await expect(new ClientApi("http://x", () => null).estJoignable()).resolves.toBe(false);
    });

    it("faux quand le serveur est injoignable, sans lever d'erreur", async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await expect(new ClientApi("http://x", () => null).estJoignable()).resolves.toBe(false);
    });
  });

  it.each([
    ["recetteDuJour", "/dashboard/recette-du-jour"],
    ["occupation", "/dashboard/occupation"],
    ["stockBas", "/dashboard/stock-bas"],
  ] as const)("%s appelle %s", async (methode, chemin) => {
    mockFetchOnce(200, {});
    await new ClientApi("http://localhost:3000", () => "jeton")[methode]();
    expect(global.fetch).toHaveBeenCalledWith(`http://localhost:3000${chemin}`, expect.anything());
  });

  it("construit la query string des filtres pour listerChambres", async () => {
    mockFetchOnce(200, []);
    const client = new ClientApi("http://localhost:3000", () => "jeton");

    await client.listerChambres({ statut: "LIBRE" });

    expect(global.fetch).toHaveBeenCalledWith("http://localhost:3000/chambres?statut=LIBRE", expect.anything());
  });

  it("ne construit aucune query string si aucun filtre n'est fourni", async () => {
    mockFetchOnce(200, []);
    const client = new ClientApi("http://localhost:3000", () => "jeton");

    await client.listerChambres();

    expect(global.fetch).toHaveBeenCalledWith("http://localhost:3000/chambres", expect.anything());
  });

  it("envoie un PATCH JSON pour modifierStatutChambre", async () => {
    mockFetchOnce(200, { id: "c1", statut: "OCCUPEE" });
    const client = new ClientApi("http://localhost:3000", () => "jeton");

    await client.modifierStatutChambre("c1", "OCCUPEE");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/chambres/c1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ statut: "OCCUPEE" }) })
    );
  });
});
