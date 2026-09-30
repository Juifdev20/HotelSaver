/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_URL_PLAY_STORE?: string;
  readonly VITE_URL_APP_STORE?: string;
  readonly VITE_URL_WINDOWS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
