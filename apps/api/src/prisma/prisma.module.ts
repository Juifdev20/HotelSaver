import { Module } from "@nestjs/common";
import { prisma } from "@hotel-chicago/database";
import { VERIFICATEUR_JWT, VerificateurJwtSupabase } from "../common/auth/verificateur-jwt";

/** Jeton d'injection pour le PrismaClient partagé (packages/database). */
export const PRISMA = Symbol("PRISMA");

/**
 * Fournit aussi VERIFICATEUR_JWT : SupabaseAuthGuard en dépend et il est
 * utilisé dans tous les modules métier, qui importent déjà tous
 * PrismaModule — c'est le point d'infrastructure commun existant.
 */
@Module({
  providers: [
    { provide: PRISMA, useValue: prisma },
    {
      provide: VERIFICATEUR_JWT,
      useFactory: () => {
        const supabaseUrl = process.env.SUPABASE_URL;
        if (!supabaseUrl) {
          throw new Error("SUPABASE_URL n'est pas configuré : impossible de vérifier les jetons Supabase Auth.");
        }
        return new VerificateurJwtSupabase(supabaseUrl);
      },
    },
  ],
  exports: [PRISMA, VERIFICATEUR_JWT],
})
export class PrismaModule {}
