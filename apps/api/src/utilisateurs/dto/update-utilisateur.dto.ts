import { IsBoolean } from "class-validator";

/** Seul `actif` est modifiable pour l'instant (activer/désactiver un compte) —
 * un compte désactivé est immédiatement refusé à la connexion, voir
 * SupabaseAuthGuard. Pas de changement de rôle/mot de passe/email ici : à
 * traiter dans une passe séparée si le besoin se confirme. */
export class UpdateUtilisateurDto {
  @IsBoolean()
  actif!: boolean;
}
