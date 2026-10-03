import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist-landing",
    rollupOptions: {
      input: [
        "landing/index.html",
        "landing/planos/index.html",
        "landing/termos/index.html",
        "landing/privacidade/index.html",
        "landing/en/terms/index.html",
        "landing/en/privacy/index.html",
      ],
    },
  },
  server: { port: 1422, strictPort: true, open: false },
});
