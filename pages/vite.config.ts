import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        hashCharacters: "hex",
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
