import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { createQwenEarningsReviewPlugin } from "./server/qwenEarningsReviewPlugin.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(import.meta.dirname, "../.."), "");
  return {
    plugins: [
      react(),
      createQwenEarningsReviewPlugin({
        baseUrl: env.QWEN_BASE_URL || "http://192.168.1.132:8000/v1",
        apiKey: env.QWEN_API_KEY || "empty",
        model: env.QWEN_MODEL || "Qwen3.8-27B",
        deckPdfPath: env.EARNINGS_DECK_PDF || "",
        transcriptPdfPath: env.EARNINGS_TRANSCRIPT_PDF || ""
      })
    ],
    server: {
      fs: { allow: [resolve(import.meta.dirname, ".."), resolve(import.meta.dirname, "../..")] }
    }
  };
});
