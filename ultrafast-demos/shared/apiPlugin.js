import { RESPONSE_SCHEMA } from "./responseSchema.js";

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function extractOutputText(payload) {
  if (payload.output_text) return payload.output_text;
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("");
}

function createPrompt(scenario, phase, previous) {
  const context = phase === "revised"
    ? `${scenario.api.context}\n\nNEW EVIDENCE:\n${scenario.api.newEvidence}`
    : scenario.api.context;

  return [
    scenario.api.role,
    "Analyze only the supplied synthetic evidence. Do not invent sources or facts.",
    "Return a concise decision brief in the required JSON shape.",
    "The change field must be an empty string on the first pass and must name the corrected conclusion on the revision.",
    `QUESTION:\n${scenario.prompt}`,
    `EVIDENCE:\n${context}`,
    previous ? `PREVIOUS BRIEF:\n${JSON.stringify(previous)}` : ""
  ].filter(Boolean).join("\n\n");
}

export function createApiPlugin({ apiKey, scenario }) {
  return {
    name: `ultrafast-demo-api-${scenario.slug}`,
    configureServer(server) {
      server.middlewares.use("/api/status", (request, response) => {
        sendJson(response, 200, {
          liveAvailable: Boolean(apiKey),
          model: "gpt-5.6-sol"
        });
      });

      server.middlewares.use("/api/analyze", async (request, response) => {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "POST required" });
          return;
        }
        if (!apiKey) {
          sendJson(response, 503, {
            error: "Add OPENAI_API_KEY to the repository root .env to enable Live API mode."
          });
          return;
        }

        try {
          const body = await readBody(request);
          const phase = body.phase === "revised" ? "revised" : "initial";
          const tier = body.tier === "ultrafast" ? "ultrafast" : "standard";
          const startedAt = performance.now();
          const apiResponse = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "gpt-5.6-sol",
              service_tier: tier === "ultrafast" ? "fast" : "default",
              reasoning: { effort: "medium" },
              input: createPrompt(scenario, phase, body.previous),
              text: {
                verbosity: "low",
                format: {
                  type: "json_schema",
                  name: "decision_brief",
                  strict: true,
                  schema: RESPONSE_SCHEMA
                }
              }
            })
          });
          const payload = await apiResponse.json();
          const elapsedMs = Math.round(performance.now() - startedAt);

          if (!apiResponse.ok) {
            sendJson(response, apiResponse.status, {
              error: payload.error?.message || "OpenAI request failed",
              elapsedMs
            });
            return;
          }

          const outputText = extractOutputText(payload);
          sendJson(response, 200, {
            result: JSON.parse(outputText),
            elapsedMs,
            serviceTier: payload.service_tier || "unknown",
            usage: payload.usage || null
          });
        } catch (error) {
          sendJson(response, 500, { error: error.message || "Unexpected API error" });
        }
      });
    }
  };
}
