import { ClientSuperAdmin } from "./super-admin";
import { ErreurApi } from "./client";

function mockFetchOnce(status: number, corps: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(corps),
  });
}

describe("ClientSuperAdmin", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("ajoute le jeton Bearer courant à chaque requête", async () => {
    mockFetchOnce(200, []);
    const client = new ClientSuperAdmin("http://localhost:3001", () => "mon-jeton");

    await client.listerHotels();

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:3001/super-admin/hotels",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer mon-jeton" }) })
    );
  });

  it("creerHotel envoie un POST avec le corps attendu", async () => {
    const hotelCree = { id: "h1", nom: "Hôtel Test", sousDomaine: "hotel-test", statutLicence: "ACTIF" };
    mockFetchOnce(201, hotelCree);
    const client = new ClientSuperAdmin("http://localhost:3001", () => "jeton");

    const dto = { nom: "Hôtel Test", sousDomaine: "hotel-test" };
    const resultat = await client.creerHotel(dto);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:3001/super-admin/hotels",
      expect.objectContaining({ method: "POST", body: JSON.stringify(dto) })
    );
    expect(resultat).toEqual(hotelCree);
  });

  it("changerStatutHotel envoie un PATCH sur /:id/statut", async () => {
    mockFetchOnce(200, { id: "h1", statutLicence: "SUSPENDU" });
    const client = new ClientSuperAdmin("http://localhost:3001", () => "jeton");

    await client.changerStatutHotel("h1", "SUSPENDU" as any);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:3001/super-admin/hotels/h1/statut",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ statutLicence: "SUSPENDU" }) })
    );
  });

  it("transforme une réponse d'erreur en ErreurApi avec le message du serveur", async () => {
    mockFetchOnce(409, { message: 'Un hôtel avec le sous-domaine "hotel-test" existe déjà.' });
    const client = new ClientSuperAdmin("http://localhost:3001", () => "jeton");

    await expect(client.creerHotel({ nom: "X", sousDomaine: "hotel-test" })).rejects.toMatchObject({
      statusCode: 409,
      message: 'Un hôtel avec le sous-domaine "hotel-test" existe déjà.',
    });
  });

  it("lève ErreurApi(0) sur une erreur réseau", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network down"));
    const client = new ClientSuperAdmin("http://localhost:3001", () => "jeton");

    await expect(client.listerHotels()).rejects.toBeInstanceOf(ErreurApi);
  });

  it("enregistrerPaiement envoie un POST sur /:id/paiements avec le corps attendu", async () => {
    const dto = {
      montant: 50,
      devise: "USD" as any,
      methode: "MOBILE_MONEY" as any,
      periodeCouverteJusquau: "2027-01-01T00:00:00.000Z",
      note: "Payé via Airtel Money",
    };
    mockFetchOnce(201, { id: "p1", ...dto });
    const client = new ClientSuperAdmin("http://localhost:3001", () => "jeton");

    await client.enregistrerPaiement("h1", dto);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:3001/super-admin/hotels/h1/paiements",
      expect.objectContaining({ method: "POST", body: JSON.stringify(dto) })
    );
  });
});
