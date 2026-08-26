import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  publicDir: resolve(import.meta.dirname, "../../llm-output-simulator/public"),
  server: { fs: { allow: [resolve(import.meta.dirname, ".."), resolve(import.meta.dirname, "../..")] } }
});
