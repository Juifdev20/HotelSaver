import { lienHttps } from "./liensSurs";

export const configuration = {
  apiUrl: import.meta.env.VITE_API_URL as string,
  /** Liens de téléchargement de l'application (facultatifs tant que les
   * builds ne sont pas publiés : le bouton affiche alors « bientôt disponible »). */
  urlPlayStore: (import.meta.env.VITE_URL_PLAY_STORE as string | undefined) || null,
  urlAppStore: (import.meta.env.VITE_URL_APP_STORE as string | undefined) || null,
  urlWindows: (import.meta.env.VITE_URL_WINDOWS as string | undefined) || null,
  /** Page où créer un compte ScanLinkPay (facultatif, https). Sur les sites d'hôtel, c'est le lien envoyé par le serveur qui prime. */
  urlScanLinkPay: lienHttps(import.meta.env.VITE_URL_SCANLINKPAY as string | undefined),
};

if (!configuration.apiUrl) {
  throw new Error("VITE_API_URL manquant — copier .env.example en .env.");
}
