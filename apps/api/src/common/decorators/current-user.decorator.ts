import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { UtilisateurAuthentifie } from "@hotel-chicago/types";

/** Récupère l'utilisateur attaché à la requête par SupabaseAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UtilisateurAuthentifie => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  }
);
