import { performance } from "node:perf_hooks";
import { attachImageUrls, buildBatchPrompt, normalizeProviderResults, parseJsonFromText } from "../prompt.js";

const PROVIDER = "openrouter";
const PANEL_PROVIDER = "gemini";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function runOpenRouterAgent({ description, batches, emit }) {
  const model = process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free";
  const apiKey = process.env.OPENROUTER_API_KEY;
  const startedAt = performance.now();
  const parsedBatches = [];

  emit("trace", { provider: PROVIDER, panelProvider: PANEL_PROVIDER, providerRoute: PROVIDER, phase: "boot", message: `Agent online through OpenRouter with model ${model}` });
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY.");

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    const prompt = buildBatchPrompt({ description, images: batch, batchIndex, batchCount: batches.length });
    const body = {
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...batch.flatMap((image, index) => [
              { type: "text", text: `Image ${index + 1} filename: ${image.originalName}` },
              {
                type: "image_url",
                image_url: { url: image.dataUrl }
              }
            ])
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 1800,
      response_format: { type: "json_object" }
    };

    emit("trace", {
      provider: PROVIDER,
      panelProvider: PANEL_PROVIDER,
      providerRoute: PROVIDER,
      phase: "command",
      message: renderOpenRouterCurl({ model, imageCount: batch.length, description })
    });
    emit("trace", {
      provider: PROVIDER,
      panelProvider: PANEL_PROVIDER,
      providerRoute: PROVIDER,
      phase: "dispatch",
      message: `POST ${API_URL} batch ${batchIndex + 1}/${batches.length} with ${batch.length} images`
    });

    try {
      const batchStarted = performance.now();
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://127.0.0.1:5176",
          "X-Title": "Image Search"
        },
        body: JSON.stringify(body)
      });

      const responseText = await response.text();
      const latencyMs = Math.round(performance.now() - batchStarted);
      emit("trace", {
        provider: PROVIDER,
        panelProvider: PANEL_PROVIDER,
        providerRoute: PROVIDER,
        phase: response.ok ? "response" : "error",
        message: `HTTP ${response.status} in ${latencyMs}ms`
      });

      if (!response.ok) {
        throw new Error(`OpenRouter HTTP ${response.status}: ${responseText.slice(0, 700)}`);
      }

      const json = JSON.parse(responseText);
      const content = json.choices?.[0]?.message?.content || "";
      const parsed = attachImageUrls(parseJsonFromText(content), batch);
      parsedBatches.push({
        batchIndex,
        imageCount: batch.length,
        latencyMs,
        usage: json.usage || null,
        rawExcerpt: content.slice(0, 1200),
        parsed
      });

      emit("partial_result", {
        provider: PROVIDER,
        panelProvider: PANEL_PROVIDER,
        providerRoute: PROVIDER,
        batch: batchIndex + 1,
        matches: parsed.matches || [],
        misses: parsed.misses || [],
        latencyMs,
        usage: json.usage || null
      });
    } catch (error) {
      emit("error", {
        provider: PROVIDER,
        panelProvider: PANEL_PROVIDER,
        providerRoute: PROVIDER,
        batch: batchIndex + 1,
        message: error.message || String(error)
      });
      parsedBatches.push({
        batchIndex,
        imageCount: batch.length,
        latencyMs: null,
        usage: null,
        rawExcerpt: "",
        error: error.message || String(error),
        parsed: { matches: [], misses: batch.map((image) => ({ filename: image.originalName, reason: "Batch failed before scoring." })) }
      });
    }
  }

  const normalized = normalizeProviderResults({ provider: PROVIDER, batches: parsedBatches });
  const totalLatencyMs = Math.round(performance.now() - startedAt);
  emit("provider_done", {
    provider: PROVIDER,
    panelProvider: PANEL_PROVIDER,
    status: "complete",
    totalLatencyMs,
    model,
    providerRoute: PROVIDER,
    ...normalized
  });
  return { provider: PROVIDER, panelProvider: PANEL_PROVIDER, status: "complete", totalLatencyMs, model, providerRoute: PROVIDER, ...normalized };
}

function renderOpenRouterCurl({ model, imageCount, description }) {
  return [
    `curl -s ${API_URL} \\`,
    `  -H "Authorization: Bearer $OPENROUTER_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"model":"${model}","messages":[{"role":"user","content":[{"type":"text","text":"${escapeForCommand(description).slice(0, 120)}..."}, ${imageCount} labeled image_url parts]}]}'`
  ].join("\n");
}

function escapeForCommand(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}
