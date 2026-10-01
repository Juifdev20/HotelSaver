import { SetMetadata } from "@nestjs/common";

export const OPERATIONNEL_KEY = "operationnel";

/**
 * Marque une route comme « opération du quotidien » (réserver, check-in/out, facturer, ouvrir ou
 * encaisser un compte cafétaria…). Séparation des tâches : le patron n'y a accès que si l'hôtel l'a
 * autorisé (`Hotel.patronPeutOperer`). Lu par RolesGuard ; les rôles `@Roles(...)` restent inchangés.
 */
export const Operationnel = () => SetMetadata(OPERATIONNEL_KEY, true);
