import { Injectable } from "@nestjs/common";
import { SupabaseStorageService } from "../common/supabase-storage/supabase-storage.service";
import { verifierUrlsHotel } from "../common/supabase-storage/urls-hotel";
import { traiterImage, UsageImage } from "./traiter-image";

@Injectable()
export class MediaService {
  constructor(private readonly stockage: SupabaseStorageService) {}

  async envoyerImage(hotelId: string, contenu: Buffer, usage: UsageImage): Promise<{ url: string }> {
    const webp = await traiterImage(contenu, usage);
    const url = await this.stockage.envoyerImage(hotelId, webp);
    return { url };
  }

  async supprimerImage(hotelId: string, url: string): Promise<void> {
    verifierUrlsHotel([url], hotelId);
    await this.stockage.supprimerImage(hotelId, url);
  }
}
