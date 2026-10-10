import { lookup } from "dns/promises";
import { isIP } from "net";

/**
 * Téléchargement d'une image à partir d'une adresse fournie par un tiers (logo donné à l'inscription, avant tout compte).
 * Sans garde, le serveur ferait la requête pour n'importe qui : service interne (`http://localhost:3000`), métadonnées du cloud
 * (`169.254.169.254`), ou fichier de plusieurs Go qui sature la mémoire. Ici : https seulement, adresses privées refusées (après
 * résolution DNS), aucune redirection, 3 s, 1 Mo, type image.
 */
export const TAILLE_MAX_IMAGE = 1_000_000;
const DELAI_MS = 3000;

/** Adresses qui ne sont pas de l'Internet public : loopback, privées (RFC1918), link-local, CGNAT, multicast, ULA IPv6… */
export function estAdressePrivee(adresse: string): boolean {
  const v = isIP(adresse);
  if (v === 4) {
    const [a, b] = adresse.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  if (v === 6) {
    const bas = adresse.toLowerCase();
    if (bas === "::" || bas === "::1") return true;
    if (bas.startsWith("::ffff:")) return estAdressePrivee(bas.slice(7)); // IPv4 inscrite en IPv6
    return /^f[cd]/.test(bas) || /^fe[89ab]/.test(bas) || bas.startsWith("ff");
  }
  return true; // pas une adresse reconnue : refusée
}

export async function adresseUrlPublique(url: string): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const hote = u.hostname.replace(/^\[|\]$/g, "");
  if (hote === "localhost" || hote.endsWith(".localhost") || hote.endsWith(".internal") || hote.endsWith(".local")) return null;
  try {
    const adresses = isIP(hote) ? [{ address: hote }] : await lookup(hote, { all: true });
    if (adresses.length === 0 || adresses.some((a) => estAdressePrivee(a.address))) return null;
  } catch {
    return null;
  }
  return u;
}

/** Renvoie les octets de l'image, ou null (adresse refusée, trop lourde, pas une image, délai dépassé…). Ne lève jamais. */
export async function telechargerImageSure(url: string): Promise<Buffer | null> {
  try {
    const u = await adresseUrlPublique(url);
    if (!u) return null;
    const reponse = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(DELAI_MS), headers: { Accept: "image/*" } });
    if (!reponse.ok || !reponse.body) return null;
    if (!(reponse.headers.get("content-type") ?? "").toLowerCase().startsWith("image/")) return null;
    const annonce = Number(reponse.headers.get("content-length") ?? 0);
    if (annonce > TAILLE_MAX_IMAGE) return null;
    const morceaux: Uint8Array[] = [];
    let total = 0;
    for await (const morceau of reponse.body as unknown as AsyncIterable<Uint8Array>) {
      total += morceau.byteLength;
      if (total > TAILLE_MAX_IMAGE) return null;
      morceaux.push(morceau);
    }
    return Buffer.concat(morceaux);
  } catch {
    return null;
  }
}
