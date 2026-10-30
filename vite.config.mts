import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3")) return "charts";
          if (id.includes("node_modules/jspdf")) return "pdf";
          if (id.includes("node_modules/@supabase")) return "supabase";
        },
      },
    },
  },
});
