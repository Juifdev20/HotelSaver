import { BadRequestException } from "@nestjs/common";

export const BUCKET_MEDIA = "hotel-media";

/** Bucket PRIVÉ des rapports mensuels PDF — lecture uniquement par URL signée. */
export const BUCKET_RAPPORTS = "rapports";

/** Début de toute URL publique d'un fichier appartenant à cet hôtel. Les
 * fichiers sont rangés sous `<hotelId>/…` dans le bucket, ce qui permet de
 * vérifier l'appartenance d'une URL sans table de médias. */
/** Les images sont toujours rangées sous un nom `<uuid>.webp` généré par le serveur. */
export const NOM_FICHIER_VALIDE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export function prefixeUrlHotel(hotelId: string): string {
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET_MEDIA}/${hotelId}/`;
}

/** Refuse toute URL qui ne provient pas du stockage de CET hôtel : sans ça, un
 * patron pourrait afficher sur son site une image hébergée ailleurs, ou la
 * photo d'un autre hôtel, en forgeant une requête. */
export function verifierUrlsHotel(urls: Array<string | null | undefined>, hotelId: string): void {
  const prefixe = prefixeUrlHotel(hotelId);
  for (const url of urls) {
    // Préfixe de l'hôtel ET nom d'un fichier que nous avons nous-mêmes créé (UUID.webp) : pas de « %2e%2e%2f… », pas de sous-dossier.
    if (url && (!url.startsWith(prefixe) || !NOM_FICHIER_VALIDE.test(url.slice(prefixe.length)))) {
      throw new BadRequestException(
        "Les images doivent être envoyées via l'application (URL de stockage de votre hôtel uniquement)."
      );
    }
  }
}
