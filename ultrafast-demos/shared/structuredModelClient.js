function providerHeaders(provider) {
  const headers = {
    Authorization: `Bearer ${provider.apiKey}`,
    "Content-Type": "application/json",
    ...(provider.headers || {})
  };
  return headers;
}

function responsesOutputText(payload) {
  if (payload.output_text) return payload.output_text;
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("");
}

function chatOutputText(payload) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" || typeof part?.text === "string")
    .map((part) => part.text || "")
    .join("");
}

function chatMessages(input) {
  return input.map((message) => ({
    role: message.role,
    content: (message.content || []).map((part) => {
      if (part.type === "input_text") return { type: "text", text: part.text };
      if (part.type === "input_image") {
        return {
          type: "image_url",
          image_url: { url: part.image_url }
        };
      }
      throw new Error(`Unsupported model input part: ${part.type || "unknown"}.`);
    })
  }));
}

function normalizeUsage(usage) {
  if (!usage) return null;
  return {
    ...usage,
    input_tokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
    output_tokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
    total_tokens: usage.total_tokens ?? (usage.prompt_tokens || 0) + (usage.completion_tokens || 0)
  };
}

export function normalizeProviderConfig({ providers, baseUrl, apiKey, model }) {
  const entries = providers && Object.keys(providers).length
    ? Object.entries(providers)
    : [["default", { baseUrl, apiKey, model, protocol: "responses", label: "Local model" }]];

  return {
    providers: Object.fromEntries(entries.map(([id, provider]) => [id, {
      id,
      protocol: provider.protocol || "chat_completions",
      label: provider.label || id,
      ...provider
    }])),
    defaultProvider: entries[0][0]
  };
}

export function selectProvider(config, lane) {
  const id = lane || config.defaultProvider;
  const provider = config.providers[id];
  if (!provider) throw new Error(`Unknown inference lane: ${id}.`);
  if (!provider.apiKey) throw new Error(`${provider.label} API key is not configured.`);
  return provider;
}

export async function checkProvider(provider, timeoutMs = 5000) {
  if (!provider.apiKey) return false;
  try {
    const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/models`, {
      headers: providerHeaders(provider),
      signal: AbortSignal.timeout(timeoutMs)
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function callStructuredModel({ provider, schema, schemaName, input, maxOutputTokens = 750, temperature = 0 }) {
  const baseUrl = provider.baseUrl.replace(/\/$/, "");
  const common = {
    method: "POST",
    headers: providerHeaders(provider),
    signal: AbortSignal.timeout(provider.timeoutMs || 180000)
  };

  let response;
  if (provider.protocol === "responses") {
    response = await fetch(`${baseUrl}/responses`, {
      ...common,
      body: JSON.stringify({
        model: provider.model,
        input,
        reasoning: { effort: "none" },
        temperature,
        max_output_tokens: maxOutputTokens,
        text: { format: { type: "json_schema", name: schemaName, strict: true, schema } }
      })
    });
  } else {
    const completionMultiplier = provider.completionMultiplier || 3;
    const tokenBudget = Math.max(maxOutputTokens * completionMultiplier, 1200);
    response = await fetch(`${baseUrl}/chat/completions`, {
      ...common,
      body: JSON.stringify({
        model: provider.model,
        messages: chatMessages(input),
        temperature,
        [provider.maxTokenField || "max_completion_tokens"]: tokenBudget,
        response_format: {
          type: "json_schema",
          json_schema: { name: schemaName, strict: true, schema }
        },
        ...(provider.requestOptions || {})
      })
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${provider.label} returned a non-JSON response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const detail = payload.error?.message || payload.message || (typeof payload.error === "string" ? payload.error : "");
    throw new Error(detail || `${provider.label} request failed with HTTP ${response.status}.`);
  }

  const outputText = provider.protocol === "responses" ? responsesOutputText(payload) : chatOutputText(payload);
  return {
    outputText,
    usage: normalizeUsage(payload.usage),
    responseId: payload.id || null,
    finishReason: payload.choices?.[0]?.finish_reason || payload.incomplete_details?.reason || payload.status || null
  };
}
