import type { Logger } from "@nestjs/common";
import type { PrismaClient } from "@hotel-chicago/database";
import sharp from "sharp";
import { BrandingPdf } from "./commun";

/** En-tête PDF de l'hôtel connecté (nom, adresse, téléphone, logo, couleur) —
 * partagé par les rapports mensuels et l'export des dépenses. */
export async function chargerBrandingPdf(prisma: PrismaClient, hotelId: string, logger: Logger): Promise<BrandingPdf> {
  const hotel = await prisma.hotel.findUniqueOrThrow({
    where: { id: hotelId },
    include: { branding: true },
  });
  const palette = hotel.branding?.palette as { light?: { navy?: string } } | null;
  let logo: Buffer | null = null;
  const logoUrl = hotel.branding?.logoUrl;
  if (logoUrl) {
    try {
      const reponse = await fetch(logoUrl);
      if (reponse.ok) {
        // Le logo peut être WebP (stockage images) : pdfkit ne lit que PNG/JPEG.
        logo = await sharp(Buffer.from(await reponse.arrayBuffer())).png().toBuffer();
      }
    } catch (erreur) {
      logger.warn(`Logo de l'hôtel ${hotelId} illisible, document sans logo : ${(erreur as Error).message}`);
    }
  }
  return {
    nom: hotel.nom,
    adresse: hotel.adresse,
    telephone: hotel.telephoneContact,
    logo,
    couleur: palette?.light?.navy ?? undefined,
  };
}
