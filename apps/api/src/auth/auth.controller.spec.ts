import { AuthController } from "./auth.controller";

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
    const { controleur, prisma } = creer({ nom: "Hôtel Test", site: { slogan: "  Votre escale de détente  " } });
    const profil = await controleur.moi(UTILISATEUR);
    expect(prisma.hotel.findUnique).toHaveBeenCalledWith({
      where: { id: "hotel-1" },
      select: { nom: true, site: { select: { slogan: true } } },
    });
    expect(profil).toEqual({ ...UTILISATEUR, hotelNom: "Hôtel Test", hotelSlogan: "Votre escale de détente" });
  });

  it("slogan null quand le patron n'en a pas défini (ni site, ni slogan vide)", async () => {
    expect((await creer({ nom: "Hôtel Test", site: null }).controleur.moi(UTILISATEUR)).hotelSlogan).toBeNull();
    expect((await creer({ nom: "Hôtel Test", site: { slogan: "   " } }).controleur.moi(UTILISATEUR)).hotelSlogan).toBeNull();
  });

  it("ne plante pas si l'hôtel est introuvable (nom vide)", async () => {
    const profil = await creer(null).controleur.moi(UTILISATEUR);
    expect(profil.hotelNom).toBe("");
  });
});
