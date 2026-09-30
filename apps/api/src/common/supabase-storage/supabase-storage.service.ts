import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { BUCKET_MEDIA, prefixeUrlHotel } from "./urls-hotel";

/**
 * Stockage des images via l'API Storage de Supabase (clé service_role), comme
 * SupabaseAdminService le fait pour Auth. Un seul bucket public `hotel-media`,
 * un dossier par hôtel. Le bucket est créé à la demande au premier envoi : pas
 * de geste manuel dans le tableau de bord Supabase.
 */
@Injectable()
export class SupabaseStorageService {
  private bucketPret = false;

  private config() {
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.SUPABASE_URL;
    if (!cle || !url) {
      throw new InternalServerErrorException("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY non configurés.");
    }
    return { cle, url };
  }

  private async assurerBucket(): Promise<void> {
    if (this.bucketPret) return;
    const { cle, url } = this.config();
    const reponse = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers: { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: BUCKET_MEDIA,
        name: BUCKET_MEDIA,
        public: true,
        // Filet de sécurité côté Supabase : le traitement sharp ne produit que du WebP léger.
        file_size_limit: 2 * 1024 * 1024,
        allowed_mime_types: ["image/webp"],
      }),
    });
    // 409/400 « already exists » : le bucket est déjà là, c'est le cas normal.
    if (!reponse.ok && reponse.status !== 409) {
      const corps = await reponse.text().catch(() => "");
      if (!/already exists|Duplicate/i.test(corps)) {
        throw new InternalServerErrorException(`Création du bucket refusée (${reponse.status}).`);
      }
    }
    this.bucketPret = true;
  }

  /** Enregistre un WebP et renvoie son URL publique. */
  async envoyerImage(hotelId: string, contenu: Buffer): Promise<string> {
    await this.assurerBucket();
    const { cle, url } = this.config();
    const chemin = `${hotelId}/${randomUUID()}.webp`;
    const reponse = await fetch(`${url}/storage/v1/object/${BUCKET_MEDIA}/${chemin}`, {
      method: "POST",
      headers: { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "image/webp", "Cache-Control": "max-age=31536000" },
      body: contenu,
    });
    if (!reponse.ok) {
      const corps = await reponse.text().catch(() => "");
      throw new InternalServerErrorException(`Envoi de l'image refusé (${reponse.status}) : ${corps.slice(0, 200)}`);
    }
    return `${prefixeUrlHotel(hotelId)}${chemin.split("/")[1]}`;
  }

  /** Supprime un fichier de CET hôtel (l'appartenance est vérifiée par l'appelant). */
  async supprimerImage(hotelId: string, urlPublique: string): Promise<void> {
    const { cle, url } = this.config();
    const nom = urlPublique.slice(prefixeUrlHotel(hotelId).length);
    if (!nom || nom.includes("/") || nom.includes("..")) return;
    await fetch(`${url}/storage/v1/object/${BUCKET_MEDIA}/${hotelId}/${nom}`, {
      method: "DELETE",
      headers: { apikey: cle, Authorization: `Bearer ${cle}` },
    }).catch(() => undefined);
  }
}
