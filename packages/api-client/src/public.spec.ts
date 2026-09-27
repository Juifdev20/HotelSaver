import {
  creerDemandeReservationPublique,
  inscrireHotel,
  listerChambresDisponibles,
  listerMenu,
  obtenirInfoPublique,
} from "./public";
import { ErreurApi } from "./client";

function mockFetchOnce(ok: boolean, status: number, corps: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    status,
    json: () => Promise.resolve(corps),
  });
}

const config = { url: "https://api.exemple.com" };
const dto = {
  nom: "Hôtel Test",
  sousDomaine: "hotel-test",
  nomProprietaire: "Jean Proprio",
  email: "jean@exemple.com",
  motDePasse: "motdepasse123",
};

describe("inscrireHotel", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("envoie le corps au bon endpoint et renvoie l'hôtel créé", async () => {
    const hotelCree = { id: "h1", nom: "Hôtel Test", sousDomaine: "hotel-test", statutLicence: "ESSAI" };
    mockFetchOnce(true, 201, hotelCree);

    const resultat = await inscrireHotel(config, dto);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.exemple.com/public/hotels/inscription",
      expect.objectContaining({ method: "POST", body: JSON.stringify(dto) })
    );
    expect(resultat).toEqual(hotelCree);
  });

  it("lève ErreurApi(409) si le sous-domaine est déjà pris", async () => {
    mockFetchOnce(false, 409, { message: 'Un hôtel avec le sous-domaine "hotel-test" existe déjà.' });

    await expect(inscrireHotel(config, dto)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Un hôtel avec le sous-domaine "hotel-test" existe déjà.',
    });
  });

  it("lève ErreurApi(409) si l'email est déjà enregistré", async () => {
    mockFetchOnce(false, 409, { message: "A user with this email address has already been registered" });

    await expect(inscrireHotel(config, dto)).rejects.toBeInstanceOf(ErreurApi);
  });

  it("lève ErreurApi(0) sur une erreur réseau", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network down"));

    await expect(inscrireHotel(config, dto)).rejects.toMatchObject({ statusCode: 0 });
  });
});

describe("listerChambresDisponibles", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("transmet le sousDomaine en paramètre de requête", async () => {
    mockFetchOnce(true, 200, []);
    await listerChambresDisponibles(config, "chicago");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.exemple.com/public/chambres-disponibles?sousDomaine=chicago",
      expect.anything()
    );
  });

  it("transmet aussi les dates si fournies", async () => {
    mockFetchOnce(true, 200, []);
    await listerChambresDisponibles(config, "chicago", { dateArrivee: "2026-10-01", dateDepart: "2026-10-03" });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.exemple.com/public/chambres-disponibles?sousDomaine=chicago&dateArrivee=2026-10-01&dateDepart=2026-10-03",
      expect.anything()
    );
  });

  it("lève ErreurApi(404) si le sous-domaine est inconnu", async () => {
    mockFetchOnce(false, 404, { message: 'Aucun hôtel disponible pour "inconnu".' });
    await expect(listerChambresDisponibles(config, "inconnu")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("listerMenu", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("transmet le sousDomaine en paramètre de requête", async () => {
    mockFetchOnce(true, 200, []);
    await listerMenu(config, "chicago");
    expect(global.fetch).toHaveBeenCalledWith("https://api.exemple.com/public/menu?sousDomaine=chicago", expect.anything());
  });
});

describe("creerDemandeReservationPublique", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("envoie le corps (avec sousDomaine) au bon endpoint", async () => {
    const dtoReservation = {
      sousDomaine: "chicago",
      chambreId: "c1",
      client: { nom: "Jean Visiteur" },
      dateArrivee: "2026-10-01T00:00:00.000Z",
      dateDepart: "2026-10-03T00:00:00.000Z",
    };
    mockFetchOnce(true, 201, { id: "r1" });

    await creerDemandeReservationPublique(config, dtoReservation);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.exemple.com/public/reservations",
      expect.objectContaining({ method: "POST", body: JSON.stringify(dtoReservation) })
    );
  });
});

describe("obtenirInfoPublique", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("transmet le sousDomaine et renvoie la charte graphique", async () => {
    const info = {
      nom: "Hôtel Chicago",
      logoUrl: null,
      policeAffichage: "Fraunces",
      policeCorps: "Public Sans",
      policeMono: "IBM Plex Mono",
      palette: { light: { bleu: "#1769E0" } },
    };
    mockFetchOnce(true, 200, info);

    const resultat = await obtenirInfoPublique(config, "chicago");

    expect(global.fetch).toHaveBeenCalledWith("https://api.exemple.com/public/hotel?sousDomaine=chicago", expect.anything());
    expect(resultat).toEqual(info);
  });

  it("lève ErreurApi(404) si le sous-domaine est inconnu", async () => {
    mockFetchOnce(false, 404, { message: 'Aucun hôtel disponible pour "inconnu".' });
    await expect(obtenirInfoPublique(config, "inconnu")).rejects.toMatchObject({ statusCode: 404 });
  });
});
