import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 5174,
  },
  resolve: {
    alias: {
      "ace-builds": "ace-builds",
    },
  },
  optimizeDeps: {
    include: ["ace-builds"],
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: true,
    minify: "terser",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          ace: ["ace-builds"],
        },
      },
    },
  },
  worker: {
    format: "es",
  },
  publicDir: "public",
  assetsInclude: ["**/*.worker.js"],
});
