import { ConflictException, InternalServerErrorException } from "@nestjs/common";
import { SupabaseAdminService } from "./supabase-admin.service";

describe("SupabaseAdminService", () => {
  const ancienFetch = global.fetch;
  const ancienEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://exemple.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "cle-test";
  });

  afterEach(() => {
    global.fetch = ancienFetch;
    process.env = { ...ancienEnv };
  });

  it("convertit un 422 Supabase (email déjà enregistré) en ConflictException, pas un 500", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ msg: "A user with this email address has already been registered" }),
    }) as any;

    const service = new SupabaseAdminService();
    await expect(service.creerCompte({ email: "deja@exemple.com", motDePasse: "abc12345" })).rejects.toThrow(
      ConflictException
    );
  });

  it("laisse les autres erreurs Supabase en InternalServerErrorException", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ msg: "Erreur interne Supabase" }),
    }) as any;

    const service = new SupabaseAdminService();
    await expect(service.creerCompte({ email: "x@exemple.com", motDePasse: "abc12345" })).rejects.toThrow(
      InternalServerErrorException
    );
  });

  it("renvoie le compte créé en cas de succès", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "auth-1", email: "x@exemple.com" }),
    }) as any;

    const service = new SupabaseAdminService();
    const compte = await service.creerCompte({ email: "x@exemple.com", motDePasse: "abc12345" });
    expect(compte).toEqual({ id: "auth-1", email: "x@exemple.com" });
  });
});
