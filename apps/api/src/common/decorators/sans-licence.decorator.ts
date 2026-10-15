import { SetMetadata } from "@nestjs/common";

export const SANS_LICENCE_KEY = "sansLicence";

/**
 * Route accessible MÊME quand l'abonnement de l'hôtel a expiré (ou est suspendu) : le profil (`/auth/me`), l'écran d'abonnement et le
 * paiement lui-même. Sans cela un hôtel dont l'essai se termine ne pourrait même plus ouvrir l'application pour payer. Toute autre route
 * répond 402 `ABONNEMENT_BLOQUE` (voir SupabaseAuthGuard).
 */
export const SansLicence = () => SetMetadata(SANS_LICENCE_KEY, true);
