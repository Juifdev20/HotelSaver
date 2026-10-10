import { AuthController, urlSiteHotel } from "./auth.controller";

const UTILISATEUR = {
  userId: "u-1",
  supabaseAuthId: "auth-1",
  role: "PATRON",
  nom: "Patron Hôtel Test",
  hotelId: "hotel-1",
} as any;

function creer(hotel: unknown) {
  const prisma = { hotel: { findUnique: jest.fn().mockResolvedValue(hotel) } } as any;
  return { prisma, controleur: new AuthController(prisma) };
}

describe("AuthController.moi", () => {
  it("renvoie l'utilisateur avec le nom et le slogan de SON hôtel", async () => {
    const { controleur, prisma } = creer({
      nom: "Hôtel Test",
      adresse: " Avenue du Lac 12, Goma ",
      telephoneContact: "+243 970 000 000",
      sousDomaine: "test",
      domainePersonnalise: null,
      domaineVerifie: false,
      statutLicence: "ACTIF",
      createdAt: new Date("2026-09-01T00:00:00Z"),
      paiementsLicence: [{ periodeCouverteJusquau: new Date("2026-12-31T00:00:00Z") }],
      site: { slogan: "  Votre escale de détente  " },
    });
    const profil = await controleur.moi(UTILISATEUR);
    expect(prisma.hotel.findUnique).toHaveBeenCalledWith({
      where: { id: "hotel-1" },
      select: {
        nom: true,
        adresse: true,
        telephoneContact: true,
        sousDomaine: true,
        domainePersonnalise: true,
        domaineVerifie: true,
        statutLicence: true,
        createdAt: true,
        site: { select: { slogan: true } },
        paiementsLicence: { orderBy: { periodeCouverteJusquau: "desc" }, take: 1, select: { periodeCouverteJusquau: true } },
      },
    });
    expect(profil).toEqual({
      ...UTILISATEUR,
      hotelNom: "Hôtel Test",
      hotelSlogan: "Votre escale de détente",
      hotelAdresse: "Avenue du Lac 12, Goma",
      hotelTelephone: "+243 970 000 000",
      hotelUrlSite: expect.stringMatching(/\/\?hotel=test$/),
      statutLicence: "ACTIF",
      licenceValideJusquau: "2026-12-31T00:00:00.000Z",
    });
  });

  it("hotelUrlSite : domaine personnalisé seulement une fois vérifié", () => {
    expect(urlSiteHotel({ sousDomaine: "chicago", domainePersonnalise: "www.hotel-chicago.com", domaineVerifie: true })).toBe(
      "https://www.hotel-chicago.com"
    );
    const sansDomaine = urlSiteHotel({ sousDomaine: "chicago", domainePersonnalise: "www.hotel-chicago.com", domaineVerifie: false });
    expect(sansDomaine).toMatch(/^https?:\/\/[^?]+\/\?hotel=chicago$/);
  });

  it("slogan null quand le patron n'en a pas défini (ni site, ni slogan vide)", async () => {
    expect((await creer({ nom: "Hôtel Test", site: null, createdAt: new Date(), paiementsLicence: [] }).controleur.moi(UTILISATEUR)).hotelSlogan).toBeNull();
    expect((await creer({ nom: "Hôtel Test", site: { slogan: "   " }, createdAt: new Date(), paiementsLicence: [] }).controleur.moi(UTILISATEUR)).hotelSlogan).toBeNull();
  });

  it("ne plante pas si l'hôtel est introuvable (nom vide)", async () => {
    const profil = await creer(null).controleur.moi(UTILISATEUR);
    expect(profil.hotelNom).toBe("");
  });
});
