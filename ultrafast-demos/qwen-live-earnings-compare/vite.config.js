import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { createQwenEarningsReviewPlugin } from "../qwen-live-earnings-review/server/qwenEarningsReviewPlugin.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(import.meta.dirname, "../.."), "");
  return {
    plugins: [
      react(),
      createQwenEarningsReviewPlugin({
        providers: {
          openrouter: {
            label: "OpenRouter",
            baseUrl: "https://openrouter.ai/api/v1",
            apiKey: env.OPENROUTER_API_KEY || "",
            model: env.OPENROUTER_MODEL || "qwen/qwen3.8-27b",
            protocol: "chat_completions",
            completionMultiplier: 2,
            maxTokenField: "max_tokens",
            headers: {
              "HTTP-Referer": "http://127.0.0.1:5191",
              "X-OpenRouter-Title": "Earnings Quality Race"
            },
            requestOptions: {
              reasoning: { effort: "none" },
              provider: { require_parameters: true }
            }
          },
          cerebras: {
            label: "Cerebras",
            baseUrl: "https://api.cerebras.ai/v1",
            apiKey: env.CEREBRAS_API_KEY || "",
            model: env.CEREBRAS_MODEL || "qwen-3.8-27b",
            protocol: "chat_completions",
            completionMultiplier: 4,
            headers: { "X-Cerebras-Version-Patch": "2" },
            requestOptions: { reasoning_effort: "none" }
          }
        },
        deckPdfPath: env.EARNINGS_DECK_PDF || "",
        transcriptPdfPath: env.EARNINGS_TRANSCRIPT_PDF || ""
      })
    ],
    server: {
      fs: { allow: [resolve(import.meta.dirname, ".."), resolve(import.meta.dirname, "../..")] }
    }
  };
});
