import { lienHttps } from "./liensSurs";

const DERNIERE_RELEASE = "https://github.com/Juifdev20/HotelSaver/releases/latest/download";

export const configuration = {
  apiUrl: import.meta.env.VITE_API_URL as string,
  /** Liens de téléchargement de l'application (facultatifs tant que les
   * builds ne sont pas publiés : le bouton affiche alors « bientôt disponible »). */
  urlPlayStore: (import.meta.env.VITE_URL_PLAY_STORE as string | undefined) || null,
  urlAppStore: (import.meta.env.VITE_URL_APP_STORE as string | undefined) || null,
  /** Par défaut : la DERNIÈRE release GitHub, fichiers au nom fixe (19/10/2026) — une nouvelle version ne demande plus de
   * reconstruire le site. Une variable VITE_URL_* renseignée reste prioritaire. */
  urlWindows: (import.meta.env.VITE_URL_WINDOWS as string | undefined) || `${DERNIERE_RELEASE}/HotelSaver-Setup.exe`,
  /** APK Android en téléchargement direct (GitHub Releases), tant que l'application n'est pas sur le Play Store. */
  urlAndroidApk: (import.meta.env.VITE_URL_ANDROID_APK as string | undefined) || `${DERNIERE_RELEASE}/HotelSaver.apk`,
  /** Page où créer un compte ScanLinkPay (facultatif, https). Sur les sites d'hôtel, c'est le lien envoyé par le serveur qui prime. */
  urlScanLinkPay: lienHttps(import.meta.env.VITE_URL_SCANLINKPAY as string | undefined),
};

if (!configuration.apiUrl) {
  throw new Error("VITE_API_URL manquant — copier .env.example en .env.");
}
