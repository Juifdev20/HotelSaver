import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@hotel-chicago/types";
import { MESSAGE_PATRON_NON_OPERANT, RolesGuard } from "./roles.guard";
import { Roles } from "../decorators/roles.decorator";
import { Operationnel } from "../decorators/operationnel.decorator";

class Controleur {
  @Roles(Role.RECEPTIONNISTE, Role.PATRON)
  lecture() {}

  @Roles(Role.RECEPTIONNISTE, Role.PATRON)
  @Operationnel()
  reserver() {}

  @Roles(Role.CAFETARIA, Role.PATRON)
  @Operationnel()
  encaisser() {}

  @Roles(Role.PATRON)
  annuler() {}
}

function contexte(methode: keyof Controleur, user: unknown): ExecutionContext {
  return {
    getHandler: () => Controleur.prototype[methode],
    getClass: () => Controleur,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const utilisateur = (role: Role, patronPeutOperer?: boolean) => ({ userId: "u", supabaseAuthId: "a", role, nom: "N", hotelId: "h", patronPeutOperer });

describe("RolesGuard — séparation des tâches", () => {
  const guard = new RolesGuard(new Reflector());

  it("une route de lecture reste ouverte au patron, même sans réglage", () => {
    expect(guard.canActivate(contexte("lecture", utilisateur(Role.PATRON)))).toBe(true);
  });

  it("une opération du quotidien est REFUSÉE au patron par défaut, avec un message clair", () => {
    expect(() => guard.canActivate(contexte("reserver", utilisateur(Role.PATRON)))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contexte("encaisser", utilisateur(Role.PATRON, false)))).toThrow(MESSAGE_PATRON_NON_OPERANT);
  });

  it("…mais autorisée au patron quand l'hôtel l'a activé", () => {
    expect(guard.canActivate(contexte("reserver", utilisateur(Role.PATRON, true)))).toBe(true);
    expect(guard.canActivate(contexte("encaisser", utilisateur(Role.PATRON, true)))).toBe(true);
  });

  it("la réception et la cafétaria font toujours leurs opérations, quel que soit le réglage", () => {
    expect(guard.canActivate(contexte("reserver", utilisateur(Role.RECEPTIONNISTE, false)))).toBe(true);
    expect(guard.canActivate(contexte("encaisser", utilisateur(Role.CAFETARIA, false)))).toBe(true);
  });

  it("le rôle reste vérifié : la cafétaria ne peut pas réserver, même sur une route opérationnelle", () => {
    expect(() => guard.canActivate(contexte("reserver", utilisateur(Role.CAFETARIA)))).toThrow(ForbiddenException);
  });

  it("l'annulation avec motif (non marquée) reste possible au patron par défaut", () => {
    expect(guard.canActivate(contexte("annuler", utilisateur(Role.PATRON)))).toBe(true);
  });
});
