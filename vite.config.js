import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
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
