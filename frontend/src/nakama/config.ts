const serverKey = import.meta.env.VITE_NAKAMA_SERVER_KEY || "defaultkey";
const useSSL = (import.meta.env.VITE_NAKAMA_USE_SSL || "false").toLowerCase() === "true";

/**
 * In `npm run dev`, route Nakama through the Vite dev server (same host/port as the page).
 * Vite proxies `/v2` and `/ws` → Nakama on 127.0.0.1:7350 (see vite.config.ts), so the browser
 * never cross-origin calls port 7350 and CORS is not required for local dev.
 *
 * Set `VITE_NAKAMA_USE_VITE_PROXY=false` to talk directly to `VITE_NAKAMA_HOST`:`VITE_NAKAMA_PORT`
 * (then ensure Nakama CORS headers match your dev URL, e.g. nakama-dev.yml).
 */
function useViteProxy(): boolean {
  if (!import.meta.env.DEV) return false;
  return (import.meta.env.VITE_NAKAMA_USE_VITE_PROXY ?? "true").toLowerCase() !== "false";
}

function resolveHostPort(): { host: string; port: string } {
  if (useViteProxy() && typeof window !== "undefined") {
    const host = window.location.hostname;
    const port =
      window.location.port ||
      (window.location.protocol === "https:" ? "443" : "5173");
    return { host, port };
  }
  return {
    host: import.meta.env.VITE_NAKAMA_HOST || "localhost",
    port: import.meta.env.VITE_NAKAMA_PORT || "7350",
  };
}

/** Use getters so host/port are resolved when the Client is created (after `window` exists). */
export const nakamaConfig = {
  get host() {
    return resolveHostPort().host;
  },
  get port() {
    return resolveHostPort().port;
  },
  serverKey,
  useSSL,
};
