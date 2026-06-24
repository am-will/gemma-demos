import { performance } from "node:perf_hooks";
import { attachImageUrls, buildBatchPrompt, normalizeProviderResults, parseJsonFromText } from "../prompt.js";

const PROVIDER = "gemini";

export async function runGeminiAgent({ description, batches, emit }) {
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const apiKey = process.env.GEMINI_API_KEY;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const startedAt = performance.now();
  const parsedBatches = [];

  emit("trace", { provider: PROVIDER, phase: "boot", message: `Agent online with model ${model}` });
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY.");

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    const prompt = buildBatchPrompt({ description, images: batch, batchIndex, batchCount: batches.length });
    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            ...batch.flatMap((image, index) => [
              { text: `Image ${index + 1} filename: ${image.originalName}` },
              {
                inline_data: {
                  mime_type: image.mimeType,
                  data: image.base64
                }
              }
            ])
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1800,
        responseMimeType: "application/json",
        responseSchema: visualSearchResponseSchema
      }
    };

    emit("trace", {
      provider: PROVIDER,
      phase: "command",
      message: renderGeminiCurl({ model, imageCount: batch.length, description })
    });
    emit("trace", {
      provider: PROVIDER,
      phase: "dispatch",
      message: `POST ${apiUrl} batch ${batchIndex + 1}/${batches.length} with ${batch.length} images`
    });

    try {
      const batchStarted = performance.now();
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
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
        throw new Error(`Gemini HTTP ${response.status}: ${responseText.slice(0, 700)}`);
      }

      const json = JSON.parse(responseText);
      const content = json.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
      const parsed = attachImageUrls(parseJsonFromText(content), batch);
      parsedBatches.push({
        batchIndex,
        imageCount: batch.length,
        latencyMs,
        usage: json.usageMetadata || null,
        rawExcerpt: content.slice(0, 1200),
        parsed
      });

      emit("partial_result", {
        provider: PROVIDER,
        batch: batchIndex + 1,
        matches: parsed.matches || [],
        misses: parsed.misses || [],
        latencyMs,
        usage: json.usageMetadata || null
      });
    } catch (error) {
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

function renderGeminiCurl({ model, imageCount, description }) {
  return [
    `curl -s "https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent" \\`,
    `  -H "x-goog-api-key: $GEMINI_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"contents":[{"role":"user","parts":[{"text":"${escapeForCommand(description).slice(0, 120)}..."}, ${imageCount} labeled inline_data parts]}],"generationConfig":{"responseMimeType":"application/json","responseSchema":{...}}}'`
  ].join("\n");
}

function escapeForCommand(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

const visualSearchResponseSchema = {
  type: "OBJECT",
  properties: {
    query: { type: "STRING" },
    matches: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          filename: { type: "STRING" },
          rank: { type: "INTEGER" },
          confidence: { type: "NUMBER" },
          why_match: { type: "STRING" },
          visible_evidence: { type: "STRING" },
          possible_false_positive: { type: "STRING" }
        },
        required: ["filename", "rank", "confidence", "why_match", "visible_evidence", "possible_false_positive"]
      }
    },
    misses: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          filename: { type: "STRING" },
          reason: { type: "STRING" }
        },
        required: ["filename", "reason"]
      }
    },
    summary: { type: "STRING" }
  },
  required: ["query", "matches", "misses", "summary"]
};
