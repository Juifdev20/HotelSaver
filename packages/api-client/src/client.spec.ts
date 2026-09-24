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
