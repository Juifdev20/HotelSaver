import { BadRequestException } from "@nestjs/common";
import sharp from "sharp";

export type UsageImage = "chambre" | "couverture" | "galerie" | "produit";

/** Dimensions maximales (la plus grande image tient dans ce cadre, jamais
 * agrandie). Volontairement modestes : c'est ce qui garde la base et le
 * stockage légers — une photo de chambre finit à ~60–150 Ko. */
const CADRES: Record<UsageImage, { largeur: number; hauteur: number }> = {
  chambre: { largeur: 1280, hauteur: 960 },
  galerie: { largeur: 1280, hauteur: 960 },
  couverture: { largeur: 1920, hauteur: 1080 },
  // Photo de plat : vignette sur la page « Cuisine » du site — pas besoin de
  // plus grand qu'une chambre.
  produit: { largeur: 1024, hauteur: 768 },
};

export const TAILLE_MAX_ENVOI_OCTETS = 10 * 1024 * 1024;

/**
 * Décode n'importe quelle image courante (JPEG, PNG, WebP, HEIC selon la
 * plateforme sharp), applique l'orientation EXIF, redimensionne puis ré-encode
 * en WebP qualité 80. Retire au passage toutes les métadonnées (GPS compris).
 * Lève 400 si le fichier n'est pas une image lisible.
 */
export async function traiterImage(contenu: Buffer, usage: UsageImage): Promise<Buffer> {
  const cadre = CADRES[usage];
  try {
    return await sharp(contenu, { limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: cadre.largeur, height: cadre.hauteur, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new BadRequestException("Le fichier envoyé n'est pas une image valide (JPEG, PNG ou WebP).");
  }
}
