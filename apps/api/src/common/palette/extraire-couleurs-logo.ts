import { Vibrant } from "node-vibrant/node";
import { CouleurBaseLogo } from "./generer-palette";

/**
 * Télécharge le logo puis en extrait une couleur vive (`bleu`) et une
 * couleur sombre (`navy`) via node-vibrant (décodage JS pur via Jimp,
 * `node-vibrant/node` — aucune dépendance native, voir DECISIONS.md Phase 5).
 *
 * Ne lève JAMAIS : un logo mal formé, une URL cassée, un timeout ou un
 * format d'image non supporté ne doivent jamais faire échouer une
 * inscription — l'appelant retombe silencieusement sur PALETTE_DEFAUT.
 */
export async function extraireCouleursLogo(logoUrl: string): Promise<CouleurBaseLogo | null> {
  try {
    const reponse = await fetch(logoUrl);
    if (!reponse.ok) return null;
    const buffer = Buffer.from(await reponse.arrayBuffer());

    const palette = await Vibrant.from(buffer).getPalette();

    const vif = palette.Vibrant ?? palette.Muted ?? palette.LightVibrant;
    const sombre = palette.DarkVibrant ?? palette.DarkMuted ?? palette.Muted;

    if (!vif || !sombre) return null;

    return { bleu: vif.hex, navy: sombre.hex };
  } catch {
    return null;
  }
}
