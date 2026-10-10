import { DELAI_GRACE_JOURS, avancerHorloge, creerVerificateur, evaluerAcces, memoriserContact, verifierMotDePasse, type CompteLocal } from "./session-locale";

const profil: any = { userId: "u1", hotelId: "h1", role: "RECEPTIONNISTE", nom: "Marie", statutLicence: "ACTIF" };
const JOUR = 86_400_000;
const T0 = new Date("2026-10-01T08:00:00.000Z");

async function compte(): Promise<CompteLocal> {
  const verificateur = await creerVerificateur("Marie@Hotel.cd", "secret-123", 1000);
  return memoriserContact({ email: "marie@hotel.cd", verificateur }, profil, "rt-1", T0);
}

describe("mot de passe local", () => {
  it("accepte le bon mot de passe, quelle que soit la casse de l'e-mail", async () => {
    const v = await creerVerificateur("Marie@Hotel.cd", "secret-123", 1000);
    expect(await verifierMotDePasse("marie@hotel.cd", "secret-123", v)).toBe(true);
  });
  it("refuse un mauvais mot de passe ou un autre e-mail", async () => {
    const v = await creerVerificateur("marie@hotel.cd", "secret-123", 1000);
    expect(await verifierMotDePasse("marie@hotel.cd", "secret-124", v)).toBe(false);
    expect(await verifierMotDePasse("paul@hotel.cd", "secret-123", v)).toBe(false);
  });
  it("ne contient jamais le mot de passe, et deux empreintes du même mot de passe diffèrent (sel)", async () => {
    const a = await creerVerificateur("marie@hotel.cd", "secret-123", 1000);
    const b = await creerVerificateur("marie@hotel.cd", "secret-123", 1000);
    expect(JSON.stringify(a)).not.toContain("secret-123");
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("durée de grâce hors ligne", () => {
  it("autorisé juste après un contact avec le serveur", async () => {
    expect(evaluerAcces(await compte(), new Date(T0.getTime() + 3600_000))).toMatchObject({ autorise: true, joursRestants: DELAI_GRACE_JOURS });
  });
  it("le temps restant diminue", async () => {
    expect(evaluerAcces(await compte(), new Date(T0.getTime() + 10 * JOUR))).toMatchObject({ autorise: true, joursRestants: 4 });
  });
  it("refusé au-delà du délai, avec une explication", async () => {
    const d = evaluerAcces(await compte(), new Date(T0.getTime() + 15 * JOUR));
    expect(d).toMatchObject({ autorise: false, raison: "delai" });
    expect((d as any).message).toContain("14 jours");
  });
  it("refusé si la licence était suspendue au dernier contact", async () => {
    const c = { ...(await compte()), profil: { ...profil, statutLicence: "SUSPENDU" } };
    expect(evaluerAcces(c, T0)).toMatchObject({ autorise: false, raison: "licence" });
  });
  it("reculer l'horloge ne rallonge pas la grâce", async () => {
    let c = await compte();
    c = avancerHorloge(c, new Date(T0.getTime() + 13 * JOUR)); // l'appareil a tourné jusqu'au 13e jour
    const recule = new Date(T0.getTime() + 1 * JOUR); // puis l'horloge est ramenée au 1er jour
    expect(evaluerAcces(c, recule)).toMatchObject({ autorise: true, joursRestants: 1 });
    expect(evaluerAcces(avancerHorloge(c, new Date(T0.getTime() + 14.5 * JOUR)), recule)).toMatchObject({ autorise: false });
  });
  it("l'horloge avancée par erreur n'enferme pas : un contact serveur remet les compteurs à l'heure du serveur", async () => {
    const c = await compte();
    const apres = memoriserContact(c, profil, null, new Date(T0.getTime() + 20 * JOUR));
    expect(evaluerAcces(apres, new Date(T0.getTime() + 20 * JOUR))).toMatchObject({ autorise: true, joursRestants: DELAI_GRACE_JOURS });
  });
  it("garde l'ancien jeton de renouvellement si le nouveau contact n'en apporte pas", async () => {
    const c = await compte();
    expect(memoriserContact(c, profil, null, T0).refreshToken).toBe("rt-1");
  });
});
