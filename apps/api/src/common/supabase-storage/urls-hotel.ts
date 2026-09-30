import { BadRequestException } from "@nestjs/common";

export const BUCKET_MEDIA = "hotel-media";

/** Début de toute URL publique d'un fichier appartenant à cet hôtel. Les
 * fichiers sont rangés sous `<hotelId>/…` dans le bucket, ce qui permet de
 * vérifier l'appartenance d'une URL sans table de médias. */
export function prefixeUrlHotel(hotelId: string): string {
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET_MEDIA}/${hotelId}/`;
}

/** Refuse toute URL qui ne provient pas du stockage de CET hôtel : sans ça, un
 * patron pourrait afficher sur son site une image hébergée ailleurs, ou la
 * photo d'un autre hôtel, en forgeant une requête. */
export function verifierUrlsHotel(urls: Array<string | null | undefined>, hotelId: string): void {
  const prefixe = prefixeUrlHotel(hotelId);
  for (const url of urls) {
    if (url && !url.startsWith(prefixe)) {
      throw new BadRequestException(
        "Les images doivent être envoyées via l'application (URL de stockage de votre hôtel uniquement)."
      );
    }
  }
}
