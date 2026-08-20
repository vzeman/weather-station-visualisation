import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "weather-archive-site-url",
      transformIndexHtml(html) {
        return html.replaceAll("__SITE_URL__", process.env.VITE_SITE_URL || ".");
      },
    },
  ],
  build: { target: "es2022" },
});
