import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Nakama HTTP + WS (Docker maps 7350 on the host). Proxy avoids browser CORS (5173 → 7350). */
const nakamaTarget = process.env.VITE_PROXY_NAKAMA_TARGET || "http://127.0.0.1:7350";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/v2": {
        target: nakamaTarget,
        changeOrigin: true,
      },
      "/ws": {
        target: nakamaTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
