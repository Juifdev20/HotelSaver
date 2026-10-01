// Variables injectees au build par electron-vite (prefixe MAIN_VITE_ pour le process principal).
interface ImportMetaEnv {
  readonly MAIN_VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
