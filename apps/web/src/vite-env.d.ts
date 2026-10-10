/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Clé de site Cloudflare Turnstile (publique). Absente = pas de CAPTCHA affiché. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_URL_PLAY_STORE?: string;
  readonly VITE_URL_APP_STORE?: string;
  readonly VITE_URL_WINDOWS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
