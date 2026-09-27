import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist-landing",
    rollupOptions: { input: "landing/index.html" },
  },
  server: { port: 1422, strictPort: true, open: false },
});
