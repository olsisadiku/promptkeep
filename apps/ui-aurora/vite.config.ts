import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "node:path";

const PORT = 5181;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      // Consume the shared package straight from source so Vite transpiles it
      // as part of this app (no separate build step for shared-ui).
      "@spl/shared-ui": path.resolve(__dirname, "../../packages/shared-ui/src/index.ts"),
    },
  },
  clearScreen: false,
  envDir: path.resolve(__dirname, "../.."),
  envPrefix: ["VITE_"],
  server: {
    port: PORT,
    strictPort: true,
    host: "127.0.0.1",
  },
  build: { target: "es2022" },
});
