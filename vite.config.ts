import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    proxy: {
      "/trpc": "http://localhost:3000",
      "/healthz": "http://localhost:3000"
    }
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  }
});
