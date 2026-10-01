import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role, UtilisateurAuthentifie, peutOperer } from "@hotel-chicago/types";
import { OPERATIONNEL_KEY } from "../decorators/operationnel.decorator";
import { ROLES_KEY } from "../decorators/roles.decorator";

/** Message partagé avec la synchronisation (apps/api/src/sync) : même refus, même texte. */
export const MESSAGE_PATRON_NON_OPERANT =
  "Le patron ne réalise pas les opérations du quotidien (réception, caisse). Activez « Le patron peut aussi opérer » dans Paramètres si nécessaire.";

/**
 * Applique la matrice de permissions (section 9.3). Doit toujours être
 * utilisé après SupabaseAuthGuard, qui attache `request.user`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const operationnel = this.reflector.getAllAndOverride<boolean | undefined>(OPERATIONNEL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if ((!requiredRoles || requiredRoles.length === 0) && !operationnel) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: UtilisateurAuthentifie | undefined = request.user;

    if (requiredRoles && requiredRoles.length > 0 && (!user || !requiredRoles.includes(user.role))) {
      throw new ForbiddenException(
        `Accès refusé pour le rôle ${user?.role ?? "inconnu"} sur cette ressource.`
      );
    }

    // Séparation des tâches : une opération du quotidien n'est pas pour le patron, sauf réglage de l'hôtel.
    if (operationnel && user && !peutOperer(user)) {
      throw new ForbiddenException(MESSAGE_PATRON_NON_OPERANT);
    }

    return true;
  }
}
