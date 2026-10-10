import { ErreurApi } from "@hotel-chicago/api-client";
import { GestionnaireSession, type ComptesMemorises, type DepsSession, type JetonSession } from "./gestionnaire-session";
import { creerVerificateur, memoriserContact } from "./session-locale";

const JOUR = 86_400_000;
const profil = (extra: object = {}): any => ({ userId: "u1", hotelId: "h1", role: "RECEPTIONNISTE", nom: "Marie", statutLicence: "ACTIF", ...extra });

function monde() {
  const etat = { reseau: true, maintenant: new Date("2026-10-01T08:00:00Z"), memo: { comptes: {}, compteActif: null } as ComptesMemorises, mdpValide: "secret-123", licence: "ACTIF", refreshValide: true };
  let compteur = 0;
  const jeton = (): JetonSession => ({ accessToken: `at-${++compteur}`, refreshToken: `rt-${compteur}`, expiresAt: etat.maintenant.getTime() / 1000 + 3600 });
  const reseau = () => { if (!etat.reseau) throw new ErreurApi(0, "Impossible de joindre le serveur de connexion."); };
  const deps: DepsSession = {
    authentifier: async (email, mdp) => { reseau(); if (mdp !== etat.mdpValide) throw new Error("Email ou mot de passe incorrect."); return jeton(); },
    rafraichir: async () => { reseau(); if (!etat.refreshValide) throw new Error("Votre session a expiré. Reconnectez-vous."); return jeton(); },
    chargerProfil: async () => { reseau(); if (etat.licence === "SUSPENDU") throw new ErreurApi(401, "Cet hôtel n'a plus accès à la plateforme."); return profil({ statutLicence: etat.licence }); },
    lire: async () => structuredClone(etat.memo),
    ecrire: async (d) => { etat.memo = structuredClone(d); },
    maintenant: () => etat.maintenant,
  };
  return { etat, deps, session: () => new GestionnaireSession(deps) };
}

describe("connexion", () => {
  it("en ligne : mémorise le compte (empreinte, profil, jeton de renouvellement) sans le mot de passe", async () => {
    const m = monde();
    const r = await m.session().connecter("Marie@Hotel.cd", "secret-123");
    expect(r).toMatchObject({ etat: "connecte", mode: "en-ligne", email: "marie@hotel.cd" });
    const compte = m.etat.memo.comptes["marie@hotel.cd"];
    expect(compte.refreshToken).toMatch(/^rt-/);
    expect(compte.verifieLe).toBe(m.etat.maintenant.toISOString());
    expect(m.etat.memo.compteActif).toBe("marie@hotel.cd");
    expect(JSON.stringify(m.etat.memo)).not.toContain("secret-123");
  });

  it("en ligne : un mauvais mot de passe est refusé tel quel (pas de bascule hors ligne)", async () => {
    const m = monde();
    expect(await m.session().connecter("marie@hotel.cd", "faux")).toEqual({ etat: "erreur", message: "Email ou mot de passe incorrect." });
  });

  it("hors ligne, première connexion sur l'appareil : refusée avec une explication", async () => {
    const m = monde();
    m.etat.reseau = false;
    const r = await m.session().connecter("marie@hotel.cd", "secret-123");
    expect(r).toMatchObject({ etat: "erreur", message: expect.stringContaining("Première connexion") });
  });

  it("hors ligne, compte déjà connu : mot de passe vérifié localement, accès accordé", async () => {
    const m = monde();
    await m.session().connecter("marie@hotel.cd", "secret-123");
    m.etat.reseau = false;
    m.etat.maintenant = new Date(m.etat.maintenant.getTime() + 3 * JOUR);
    const s = m.session();
    expect(await s.connecter("marie@hotel.cd", "faux")).toMatchObject({ etat: "erreur", message: "Email ou mot de passe incorrect." });
    const r = await s.connecter("MARIE@hotel.cd", "secret-123");
    expect(r).toMatchObject({ etat: "connecte", mode: "hors-ligne" });
    expect((r as any).acces.joursRestants).toBe(11);
    expect(s.accessToken()).toBeNull();
  });

  it("hors ligne : après 5 mots de passe faux, blocage de quelques secondes", async () => {
    const m = monde();
    await m.session().connecter("marie@hotel.cd", "secret-123");
    m.etat.reseau = false;
    const s = m.session();
    for (let i = 0; i < 5; i++) await s.connecter("marie@hotel.cd", "faux");
    expect(await s.connecter("marie@hotel.cd", "secret-123")).toMatchObject({ etat: "erreur", message: expect.stringContaining("Trop de tentatives") });
    m.etat.maintenant = new Date(m.etat.maintenant.getTime() + 31_000);
    expect(await s.connecter("marie@hotel.cd", "secret-123")).toMatchObject({ etat: "connecte" });
  });

  it("hors ligne au-delà de 14 jours : refusé, il faut se reconnecter", async () => {
    const m = monde();
    await m.session().connecter("marie@hotel.cd", "secret-123");
    m.etat.reseau = false;
    m.etat.maintenant = new Date(m.etat.maintenant.getTime() + 15 * JOUR);
    expect(await m.session().connecter("marie@hotel.cd", "secret-123")).toMatchObject({ etat: "erreur", message: expect.stringContaining("14 jours") });
  });
});

describe("démarrage", () => {
  it("rien de mémorisé : écran de connexion", async () => {
    expect(await monde().session().demarrer()).toEqual({ etat: "connexion-requise" });
  });

  it("en ligne : session reprise sans mot de passe, jeton renouvelé", async () => {
    const m = monde();
    await m.session().connecter("marie@hotel.cd", "secret-123");
    const s = m.session();
    expect(await s.demarrer()).toMatchObject({ etat: "connecte", mode: "en-ligne" });
    expect(s.accessToken()).toBeTruthy();
  });

  it("session précédente sans jeton (ouverte hors ligne par mot de passe) : le mot de passe est redemandé, e-mail pré-rempli", async () => {
    const m = monde();
    const s0 = m.session();
    await s0.connecter("marie@hotel.cd", "secret-123");
    await s0.deconnecter();
    m.etat.reseau = false;
    const s1 = m.session();
    await s1.connecter("marie@hotel.cd", "secret-123"); // ouvre hors ligne, compteActif posé, pas de jeton
    expect(await m.session().demarrer()).toEqual({ etat: "connexion-requise", email: "marie@hotel.cd" });
  });

  it("sans réseau : reprise hors ligne avec le dernier profil, dans la durée de grâce", async () => {
    const m = monde();
    await m.session().connecter("marie@hotel.cd", "secret-123");
    m.etat.reseau = false;
    m.etat.maintenant = new Date(m.etat.maintenant.getTime() + 2 * JOUR);
    const r = await m.session().demarrer();
    expect(r).toMatchObject({ etat: "connecte", mode: "hors-ligne", profil: { nom: "Marie" } });
  });

  it("sans réseau et délai dépassé : connexion requise, avec l'explication", async () => {
    const m = monde();
    await m.session().connecter("marie@hotel.cd", "secret-123");
    m.etat.reseau = false;
    m.etat.maintenant = new Date(m.etat.maintenant.getTime() + 20 * JOUR);
    expect(await m.session().demarrer()).toMatchObject({ etat: "connexion-requise", message: expect.stringContaining("14 jours") });
  });

  it("session refusée par le serveur (jeton révoqué) : connexion requise, données et empreinte conservées", async () => {
    const m = monde();
    await m.session().connecter("marie@hotel.cd", "secret-123");
    m.etat.refreshValide = false;
    expect(await m.session().demarrer()).toMatchObject({ etat: "connexion-requise", email: "marie@hotel.cd" });
    expect(m.etat.memo.comptes["marie@hotel.cd"]).toBeTruthy();
  });

  it("licence suspendue depuis le dernier contact : refusée dès que le serveur répond, même avec un jeton valide", async () => {
    const m = monde();
    await m.session().connecter("marie@hotel.cd", "secret-123");
    m.etat.licence = "SUSPENDU";
    await expect(m.session().demarrer()).resolves.toMatchObject({ etat: "connexion-requise" });
  });
});

describe("retour du réseau", () => {
  it("ouvert hors ligne avec un jeton mémorisé : retrouve le serveur et repasse en ligne", async () => {
    const m = monde();
    await m.session().connecter("marie@hotel.cd", "secret-123");
    m.etat.reseau = false;
    const s = m.session();
    await s.demarrer();
    expect(s.modeActuel()).toBe("hors-ligne");
    m.etat.reseau = true;
    expect(await s.entretenir()).toMatchObject({ mode: "en-ligne", profil: { nom: "Marie" } });
    expect(s.accessToken()).toBeTruthy();
  });

  it("ouvert hors ligne par mot de passe après une déconnexion (pas de jeton) : se reconnecte avec le mot de passe saisi", async () => {
    const m = monde();
    const s0 = m.session();
    await s0.connecter("marie@hotel.cd", "secret-123");
    await s0.deconnecter();
    expect(m.etat.memo.comptes["marie@hotel.cd"].refreshToken).toBeNull();
    m.etat.reseau = false;
    const s = m.session();
    expect(await s.connecter("marie@hotel.cd", "secret-123")).toMatchObject({ mode: "hors-ligne" });
    m.etat.reseau = true;
    expect(await s.entretenir()).toMatchObject({ mode: "en-ligne" });
    expect(m.etat.memo.comptes["marie@hotel.cd"].refreshToken).toMatch(/^rt-/);
  });

  it("toujours sans réseau : reste hors ligne sans erreur", async () => {
    const m = monde();
    await m.session().connecter("marie@hotel.cd", "secret-123");
    m.etat.reseau = false;
    const s = m.session();
    await s.demarrer();
    expect(await s.entretenir()).toEqual({ mode: "hors-ligne" });
  });

  it("jeton proche de l'expiration : renouvelé ; sinon laissé tranquille", async () => {
    const m = monde();
    const s = m.session();
    await s.connecter("marie@hotel.cd", "secret-123");
    const avant = s.accessToken();
    expect((await s.entretenir()).profil).toBeUndefined();
    expect(s.accessToken()).toBe(avant);
    m.etat.maintenant = new Date(m.etat.maintenant.getTime() + 55 * 60_000);
    expect((await s.entretenir()).profil).toBeTruthy();
    expect(s.accessToken()).not.toBe(avant);
  });

  it("un contact réussi repart la durée de grâce à l'heure du serveur", async () => {
    const m = monde();
    const s = m.session();
    await s.connecter("marie@hotel.cd", "secret-123");
    m.etat.maintenant = new Date(m.etat.maintenant.getTime() + 10 * JOUR);
    await s.confirmerContact(2 * 60_000);
    expect(m.etat.memo.comptes["marie@hotel.cd"].verifieLe).toBe(new Date(m.etat.maintenant.getTime() + 2 * 60_000).toISOString());
  });
});

describe("déconnexion", () => {
  it("efface le jeton mais garde l'empreinte et le profil (connexion hors ligne possible ensuite)", async () => {
    const m = monde();
    const s = m.session();
    await s.connecter("marie@hotel.cd", "secret-123");
    await s.deconnecter();
    expect(m.etat.memo.compteActif).toBeNull();
    expect(m.etat.memo.comptes["marie@hotel.cd"].refreshToken).toBeNull();
    expect(m.etat.memo.comptes["marie@hotel.cd"].verificateur.hash).toBeTruthy();
    expect(await m.session().demarrer()).toEqual({ etat: "connexion-requise" });
    expect(s.accessToken()).toBeNull();
  });
});
