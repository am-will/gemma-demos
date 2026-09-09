import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { createQwenDealReviewPlugin } from "../qwen-sec-deal-review/server/qwenDealReviewPlugin.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(import.meta.dirname, "../.."), "");
  return {
    plugins: [
      react(),
      createQwenDealReviewPlugin({
        providers: {
          openrouter: {
            label: "GPU Inference",
            baseUrl: "https://openrouter.ai/api/v1",
            apiKey: env.OPENROUTER_API_KEY || "",
            model: env.OPENROUTER_MODEL || "qwen/qwen3.8-27b",
            protocol: "chat_completions",
            completionMultiplier: 2,
            maxTokenField: "max_tokens",
            timeoutMs: 180000,
            maxRetries: 4,
            requestOptions: {
              reasoning: { effort: "none" },
              provider: { require_parameters: true }
            }
          },
          cerebras: {
            label: "Cerebras (WSE)",
            baseUrl: "https://api.cerebras.ai/v1",
            apiKey: env.CEREBRAS_API_KEY || "",
            model: "aa-qwen-3.8-27b",
            protocol: "chat_completions",
            completionMultiplier: 4,
            timeoutMs: 45000,
            maxRetries: 3,
            headers: { "X-Cerebras-Version-Patch": "2" },
            requestOptions: { reasoning_effort: "none" }
          }
        },
        examplePdfPath: env.DEAL_REVIEW_PDF || ""
      })
    ],
    server: {
      fs: { allow: [resolve(import.meta.dirname, ".."), resolve(import.meta.dirname, "../..")] }
    }
  };
});
