import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { SupabaseAuthGuard } from "./supabase-auth.guard";
import { VerificateurJwtHs256 } from "../auth/verificateur-jwt";

const JWT_SECRET = "test-secret-ne-pas-utiliser-en-production";

function creerContexte(authorization?: string): ExecutionContext {
  const request: any = { headers: authorization ? { authorization } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

function creerPrismaMock(utilisateur: any) {
  return { utilisateur: { findUnique: jest.fn().mockResolvedValue(utilisateur) } } as any;
}

describe("SupabaseAuthGuard", () => {
  const token = jwt.sign({ sub: "auth-1" }, JWT_SECRET);
  const verificateurJwt = new VerificateurJwtHs256(JWT_SECRET);

  it("refuse un utilisateur dont l'hôtel est SUSPENDU", async () => {
    const prisma = creerPrismaMock({
      id: "u1",
      supabaseAuthId: "auth-1",
      role: "PATRON",
      nom: "P",
      actif: true,
      hotelId: "h1",
      hotel: { id: "h1", statutLicence: "SUSPENDU" },
    });
    const guard = new SupabaseAuthGuard(prisma, verificateurJwt);
    await expect(guard.canActivate(creerContexte(`Bearer ${token}`))).rejects.toThrow(UnauthorizedException);
  });

  it("refuse un utilisateur dont l'hôtel est RESILIE", async () => {
    const prisma = creerPrismaMock({
      id: "u1",
      supabaseAuthId: "auth-1",
      role: "PATRON",
      nom: "P",
      actif: true,
      hotelId: "h1",
      hotel: { id: "h1", statutLicence: "RESILIE" },
    });
    const guard = new SupabaseAuthGuard(prisma, verificateurJwt);
    await expect(guard.canActivate(creerContexte(`Bearer ${token}`))).rejects.toThrow(UnauthorizedException);
  });

  it.each(["ACTIF", "ESSAI"])("autorise un utilisateur dont l'hôtel est %s", async (statutLicence) => {
    const prisma = creerPrismaMock({
      id: "u1",
      supabaseAuthId: "auth-1",
      role: "PATRON",
      nom: "P",
      actif: true,
      hotelId: "h1",
      hotel: { id: "h1", statutLicence },
    });
    const guard = new SupabaseAuthGuard(prisma, verificateurJwt);
    await expect(guard.canActivate(creerContexte(`Bearer ${token}`))).resolves.toBe(true);
  });
});
