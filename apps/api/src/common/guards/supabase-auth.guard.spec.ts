import { ExecutionContext, HttpException } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { SupabaseAuthGuard } from "./supabase-auth.guard";
import { VerificateurJwtHs256 } from "../auth/verificateur-jwt";

const JWT_SECRET = "test-secret-ne-pas-utiliser-en-production";
const JOUR = 86_400_000;

function creerContexte(authorization?: string): ExecutionContext {
  const request: any = { headers: authorization ? { authorization } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Classe {},
  } as unknown as ExecutionContext;
}

function creerPrismaMock(utilisateur: any) {
  return { utilisateur: { findUnique: jest.fn().mockResolvedValue(utilisateur) } } as any;
}

/** Hôtel créé il y a `age` jours, éventuellement payé jusqu'à `payeJusqua` (en jours depuis maintenant). */
function hotel(statutLicence: string, opts: { age?: number; payeJusqua?: number; suspensionManuelle?: boolean } = {}) {
  return {
    id: "h1",
    statutLicence,
    suspensionManuelle: opts.suspensionManuelle ?? false,
    createdAt: new Date(Date.now() - (opts.age ?? 1) * JOUR),
    paiementsLicence: opts.payeJusqua === undefined ? [] : [{ periodeCouverteJusquau: new Date(Date.now() + opts.payeJusqua * JOUR) }],
  };
}

function utilisateurDe(h: any) {
  return { id: "u1", supabaseAuthId: "auth-1", role: "PATRON", nom: "P", actif: true, hotelId: "h1", hotel: h };
}

describe("SupabaseAuthGuard — abonnement", () => {
  const token = jwt.sign({ sub: "auth-1" }, JWT_SECRET);
  const verificateurJwt = new VerificateurJwtHs256(JWT_SECRET);
  const reflecteur = (exempte: boolean) => ({ getAllAndOverride: jest.fn().mockReturnValue(exempte) }) as any;
  const garde = (h: any, exempte = false) => new SupabaseAuthGuard(creerPrismaMock(utilisateurDe(h)), verificateurJwt, reflecteur(exempte));
  const appeler = (g: SupabaseAuthGuard) => g.canActivate(creerContexte(`Bearer ${token}`));

  it("autorise un hôtel en essai ou payé", async () => {
    await expect(appeler(garde(hotel("ESSAI", { age: 3 })))).resolves.toBe(true);
    await expect(appeler(garde(hotel("ACTIF", { age: 200, payeJusqua: 20 })))).resolves.toBe(true);
  });

  it("autorise encore un hôtel dans ses 3 jours de grâce", async () => {
    await expect(appeler(garde(hotel("ACTIF", { age: 200, payeJusqua: -2 })))).resolves.toBe(true);
    await expect(appeler(garde(hotel("ESSAI", { age: 16 })))).resolves.toBe(true); // essai fini depuis 2 jours
  });

  it("répond 402 ABONNEMENT_BLOQUE une fois la grâce dépassée — même si le cron de minuit n'est pas encore passé", async () => {
    const erreur = await appeler(garde(hotel("ACTIF", { age: 200, payeJusqua: -10 }))).catch((e) => e);
    expect(erreur).toBeInstanceOf(HttpException);
    expect(erreur.getStatus()).toBe(402);
    expect(erreur.getResponse()).toMatchObject({ code: "ABONNEMENT_BLOQUE", statusCode: 402 });
    await expect(appeler(garde(hotel("ESSAI", { age: 30 })))).rejects.toMatchObject({ status: 402 });
    await expect(appeler(garde(hotel("SUSPENDU", { age: 30 })))).rejects.toMatchObject({ status: 402 }); // suspendu par le cron
  });

  it("une route @SansLicence reste ouverte à un hôtel expiré (c'est là qu'il vient payer)", async () => {
    await expect(appeler(garde(hotel("SUSPENDU", { age: 30 }), true))).resolves.toBe(true);
    await expect(appeler(garde(hotel("ACTIF", { age: 200, payeJusqua: -10 }), true))).resolves.toBe(true);
  });

  it("suspendu À LA MAIN ou résilié : 402 sur les routes ordinaires, mais le profil reste lisible pour expliquer", async () => {
    const manuel = hotel("SUSPENDU", { age: 30, payeJusqua: 100, suspensionManuelle: true });
    await expect(appeler(garde(manuel))).rejects.toMatchObject({ status: 402 });
    await expect(appeler(garde(manuel, true))).resolves.toBe(true);
    await expect(appeler(garde(hotel("RESILIE", { age: 30, payeJusqua: 100 })))).rejects.toMatchObject({ status: 402 });
    await expect(appeler(garde(hotel("RESILIE", { age: 30, payeJusqua: 100 }), true))).resolves.toBe(true);
  });

  it("le message d'un abonnement expiré renvoie au patron ; celui d'une suspension au support", async () => {
    const expire = await appeler(garde(hotel("ESSAI", { age: 30 }))).catch((e) => e);
    expect(expire.getResponse().message).toMatch(/expiré/);
    const suspendu = await appeler(garde(hotel("SUSPENDU", { age: 30, suspensionManuelle: true }))).catch((e) => e);
    expect(suspendu.getResponse().message).toMatch(/support/i);
  });
});
