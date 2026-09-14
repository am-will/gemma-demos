import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { moneyApi } from "./server/api.js";
export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, resolve(import.meta.dirname, "../.."), ""),
    ...process.env,
  };
  return {
    plugins: [
      react(),
      moneyApi({
        apiKey: env.CEREBRAS_API_KEY,
        model: env.MONEY_AGENT_MODEL || "qwen-3.8-27b",
      }),
    ],
  };
});
