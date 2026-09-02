import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { createQwenDealReviewPlugin } from "./server/qwenDealReviewPlugin.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(import.meta.dirname, "../.."), "");
  return {
    plugins: [
      react(),
      createQwenDealReviewPlugin({
        baseUrl: env.QWEN_BASE_URL || "http://192.168.1.132:8000/v1",
        apiKey: env.QWEN_API_KEY || "empty",
        model: env.QWEN_MODEL || "Qwen3.8-27B",
        examplePdfPath: env.DEAL_REVIEW_PDF || ""
      })
    ],
    server: {
      fs: { allow: [resolve(import.meta.dirname, ".."), resolve(import.meta.dirname, "../..")] }
    }
  };
});
