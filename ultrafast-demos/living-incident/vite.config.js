import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { createApiPlugin } from "../shared/apiPlugin.js";
import { scenario } from "./src/scenario.js";

export default defineConfig(({ mode }) => {
  const repositoryRoot = resolve(import.meta.dirname, "../..");
  const env = loadEnv(mode, repositoryRoot, "");
  return {
    plugins: [react(), createApiPlugin({ apiKey: env.OPENAI_API_KEY, scenario })],
    publicDir: resolve(repositoryRoot, "llm-output-simulator/public"),
    server: { fs: { allow: [resolve(import.meta.dirname, ".."), repositoryRoot] } }
  };
});
