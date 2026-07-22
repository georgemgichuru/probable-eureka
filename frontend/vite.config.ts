import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Art Caffe Examination System",
        short_name: "Exams",
        description: "Offline-first examination platform",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
      },
      workbox: {
        navigateFallback: "/index.html",
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    // Proxy API calls to the Django backend during development.
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
