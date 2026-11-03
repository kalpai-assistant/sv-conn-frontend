/**
 * Admin console (SVC-407). A plain client-side SPA: no SSR, no PWA, no
 * Capacitor — none of the consumer app's build targets apply to an internal
 * desktop tool, so this config is deliberately much smaller than ../vite.config.ts.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "path";

export default defineConfig({
  // The router plugin must run before React so it can generate
  // src/routeTree.gen.ts from src/routes/ ahead of the JSX transform.
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // 5174 per SVC-421: one up from Vite's default, so it never collides with
  // another Vite app on 5173. strictPort fails loudly instead of drifting to
  // 5175, which would break any bookmark or backend CORS entry made for 5174.
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
});
