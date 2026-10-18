import type { PrismaClient } from "@hotel-chicago/database";
import type { PlafondsEssai } from "@hotel-chicago/types";
import { lireCatalogue } from "./catalogue";

/**
 * Plafonds de l'essai gratuit (18/10/2026) pour un hôtel qui n'a JAMAIS payé, null sinon. Un hôtel qui a une formule, un paiement non
 * annulé, ou qui a été activé à la main par le super-admin (ACTIF) n'en a pas : sa formule applique ses propres limites.
 * Les créations hors ligne passent par les mêmes services (sync.service.ts) : elles sont donc plafonnées aussi.
 */
export async function plafondsEssaiDe(prisma: PrismaClient, hotelId: string): Promise<PlafondsEssai | null> {
  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    select: { formule: true, statutLicence: true, _count: { select: { paiementsLicence: { where: { annuleLe: null } } } } },
  });
  if (!hotel || hotel.formule || hotel.statutLicence === "ACTIF" || (hotel._count?.paiementsLicence ?? 0) > 0) return null;
  const { parametres } = await lireCatalogue(prisma);
  return { chambres: parametres.maxChambresEssai, produits: parametres.maxProduitsEssai, photosGalerie: parametres.maxPhotosGalerieEssai };
}
