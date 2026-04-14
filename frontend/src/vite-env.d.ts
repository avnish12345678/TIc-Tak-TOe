/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NAKAMA_HOST: string;
  readonly VITE_NAKAMA_PORT: string;
  readonly VITE_NAKAMA_SERVER_KEY: string;
  readonly VITE_NAKAMA_USE_SSL: string;
  /** `false` to call Nakama directly in dev (default: use Vite proxy). */
  readonly VITE_NAKAMA_USE_VITE_PROXY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
