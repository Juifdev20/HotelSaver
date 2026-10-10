import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { BUCKET_MEDIA, BUCKET_RAPPORTS, NOM_FICHIER_VALIDE, prefixeUrlHotel } from "./urls-hotel";

/**
 * Stockage via l'API Storage de Supabase (clé service_role), comme
 * SupabaseAdminService le fait pour Auth. Deux buckets, créés à la demande au
 * premier envoi (pas de geste manuel dans le tableau de bord Supabase) :
 * - `hotel-media` : public, images WebP ≤ 2 Mo, un dossier par hôtel ;
 * - `rapports` : PRIVÉ, PDF mensuels des départements — lecture uniquement
 *   par URL signée délivrée après contrôle du hotelId du JWT (voir
 *   RapportsController), jamais d'URL publique.
 */
@Injectable()
export class SupabaseStorageService {
  private bucketPret = false;
  private bucketRapportsPret = false;

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

  private async assurerBucketRapports(): Promise<void> {
    if (this.bucketRapportsPret) return;
    const { cle, url } = this.config();
    const reponse = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers: { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: BUCKET_RAPPORTS,
        name: BUCKET_RAPPORTS,
        // PRIVÉ : un rapport mensuel contient les chiffres de l'hôtel — jamais public.
        public: false,
        file_size_limit: 10 * 1024 * 1024,
        allowed_mime_types: ["application/pdf"],
      }),
    });
    if (!reponse.ok && reponse.status !== 409) {
      const corps = await reponse.text().catch(() => "");
      if (!/already exists|Duplicate/i.test(corps)) {
        throw new InternalServerErrorException(`Création du bucket rapports refusée (${reponse.status}).`);
      }
    }
    this.bucketRapportsPret = true;
  }

  /**
   * Enregistre un PDF dans le bucket privé `rapports` sous `chemin`
   * ({hotelId}/{periode}/{numero}.pdf). En cas de régénération du même
   * numéro — impossible par construction (version+1 → nouveau numero), mais
   * l'upload refuse l'écrasement par sécurité (`upsert: false`).
   */
  async envoyerRapportPdf(chemin: string, contenu: Buffer, ecraser = false): Promise<void> {
    await this.assurerBucketRapports();
    const { cle, url } = this.config();
    const reponse = await fetch(`${url}/storage/v1/object/${BUCKET_RAPPORTS}/${chemin}`, {
      method: "POST",
      headers: {
        apikey: cle,
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/pdf",
        // Écraser n'est permis que pour un document « vivant » à chemin fixe (export des dépenses d'une période) : sinon chaque téléchargement
        // laisserait un nouveau fichier à jamais dans le bucket.
        "x-upsert": ecraser ? "true" : "false",
      },
      body: contenu,
    });
    if (!reponse.ok) {
      const corps = await reponse.text().catch(() => "");
      throw new InternalServerErrorException(`Envoi du rapport refusé (${reponse.status}) : ${corps.slice(0, 200)}`);
    }
  }

  /** URL signée à durée courte pour ouvrir un PDF du bucket privé. */
  async urlSigneeRapport(chemin: string, secondes = 300): Promise<string> {
    const { cle, url } = this.config();
    const reponse = await fetch(`${url}/storage/v1/object/sign/${BUCKET_RAPPORTS}/${chemin}`, {
      method: "POST",
      headers: { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: secondes }),
    });
    if (!reponse.ok) {
      const corps = await reponse.text().catch(() => "");
      throw new InternalServerErrorException(`Signature du lien refusée (${reponse.status}) : ${corps.slice(0, 200)}`);
    }
    const corps = (await reponse.json()) as { signedURL?: string };
    if (!corps.signedURL) {
      throw new InternalServerErrorException("Réponse de signature sans URL.");
    }
    return `${url}/storage/v1${corps.signedURL}`;
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
    if (!NOM_FICHIER_VALIDE.test(nom)) return;
    await fetch(`${url}/storage/v1/object/${BUCKET_MEDIA}/${hotelId}/${nom}`, {
      method: "DELETE",
      headers: { apikey: cle, Authorization: `Bearer ${cle}` },
    }).catch(() => undefined);
  }
}
