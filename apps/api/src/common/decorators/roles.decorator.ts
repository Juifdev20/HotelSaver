import { SetMetadata } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";

export const ROLES_KEY = "roles";

/** Déclare les rôles autorisés à accéder à une route. Lu par RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
