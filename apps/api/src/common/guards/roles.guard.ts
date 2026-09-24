import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { ROLES_KEY } from "../decorators/roles.decorator";

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

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: UtilisateurAuthentifie | undefined = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Accès refusé pour le rôle ${user?.role ?? "inconnu"} sur cette ressource.`
      );
    }

    return true;
  }
}
