import { Logger, Module, OnModuleInit } from "@nestjs/common";
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
export class PrismaModule implements OnModuleInit {
  private readonly logger = new Logger(PrismaModule.name);

  /**
   * Ouvre la première connexion au démarrage plutôt qu'à la première requête :
   * TCP+TLS+auth vers Supabase coûtent ~2–2,5 s depuis Kasindi, autant les
   * payer pendant le boot que sur le premier appel d'un réceptionniste.
   * `$connect()` seul ne suffit pas avec Prisma 7 + adaptateur `pg` (il ne
   * fait ouvrir aucune connexion physique au pool, mesuré) : une requête
   * triviale force réellement l'ouverture.
   * Un échec ici n'est que journalisé : l'API doit démarrer même si la base
   * est momentanément injoignable (le pool réessaiera à la prochaine requête).
   */
  async onModuleInit(): Promise<void> {
    const debut = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      this.logger.log(`Connexion Postgres établie en ${Date.now() - debut} ms`);
    } catch (erreur) {
      this.logger.warn(`Base injoignable au démarrage (${(erreur as Error).message}) — nouvel essai à la première requête`);
    }
  }
}
