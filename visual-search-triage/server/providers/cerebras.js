import { performance } from "node:perf_hooks";
import { attachImageUrls, buildBatchPrompt, normalizeProviderResults, parseJsonFromText } from "../prompt.js";

const PROVIDER = "cerebras";
const API_URL = "https://api.cerebras.ai/v1/chat/completions";

export async function runCerebrasAgent({ description, batches, emit, signal }) {
  const model = resolveCerebrasModel();
  const apiKey = process.env.CEREBRAS_API_KEY;
  const startedAt = performance.now();
  const parsedBatches = [];

  emit("trace", { provider: PROVIDER, phase: "boot", message: `Agent online with model ${model}` });
  if (!apiKey) throw new Error("Missing CEREBRAS_API_KEY.");

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    throwIfAborted(signal);
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
      max_completion_tokens: 1800
    };

    emit("trace", {
      provider: PROVIDER,
      phase: "command",
      message: renderCerebrasCurl({ model, imageCount: batch.length, description })
    });
    emit("trace", {
      provider: PROVIDER,
      phase: "dispatch",
      message: `POST ${API_URL} batch ${batchIndex + 1}/${batches.length} with ${batch.length} images`
    });

    try {
      const batchStarted = performance.now();
      const response = await fetch(API_URL, {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const responseText = await response.text();
      const latencyMs = Math.round(performance.now() - batchStarted);
      emit("trace", {
        provider: PROVIDER,
        phase: response.ok ? "response" : "error",
        message: `HTTP ${response.status} in ${latencyMs}ms`
      });

      if (!response.ok) {
        throw new Error(`Cerebras HTTP ${response.status}: ${responseText.slice(0, 700)}`);
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
        batch: batchIndex + 1,
        matches: parsed.matches || [],
        misses: parsed.misses || [],
        latencyMs,
        usage: json.usage || null
      });
    } catch (error) {
      throwIfAborted(signal);
      emit("error", {
        provider: PROVIDER,
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
    status: "complete",
    totalLatencyMs,
    model,
    ...normalized
  });
  return { provider: PROVIDER, status: "complete", totalLatencyMs, model, ...normalized };
}

function resolveCerebrasModel() {
  const configured = process.env.CEREBRAS_MODEL || "gemma-4-31b";
  return configured === "gemma-4-31b-trial" ? "gemma-4-31b" : configured;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("Run canceled.");
}

function renderCerebrasCurl({ model, imageCount, description }) {
  return [
    `curl -s ${API_URL} \\`,
    `  -H "Authorization: Bearer $CEREBRAS_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"model":"${model}","messages":[{"role":"user","content":[{"type":"text","text":"${escapeForCommand(description).slice(0, 120)}..."}, ${imageCount} labeled image_url parts]}]}'`
  ].join("\n");
}

function escapeForCommand(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}
