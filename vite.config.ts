import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    sourcemap: true,
  },
  server: {
    proxy: {
      "/notion-api": {
        target: "https://api.notion.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/notion-api/, "/v1"),
      },
    },
  },
});
