/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Clé de site Cloudflare Turnstile (publique). Absente = pas de CAPTCHA affiché. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_URL_PLAY_STORE?: string;
  readonly VITE_URL_APP_STORE?: string;
  readonly VITE_URL_WINDOWS?: string;
  readonly VITE_URL_ANDROID_APK?: string;
  /** Page de création d'un compte ScanLinkPay (https), facultative. */
  readonly VITE_URL_SCANLINKPAY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
