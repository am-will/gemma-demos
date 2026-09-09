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

function retryDelayMs(response, attempt) {
  const retryAfter = Number(response?.headers?.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 5000);
  return 500 * (attempt + 1);
}

function isTransientStatus(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function fetchProvider(provider, url, init) {
  const maxRetries = Math.max(0, provider.maxRetries || 0);
  const timeoutMs = provider.timeoutMs || 180000;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!isTransientStatus(response.status) || attempt === maxRetries) return response;
      console.warn(`[model-provider] ${provider.label} returned HTTP ${response.status}; retry ${attempt + 1}/${maxRetries}`);
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response, attempt)));
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`[model-provider] ${provider.label} failed after ${attempt + 1} attempts`, error);
        throw new Error(`${provider.label} is temporarily unavailable. Please run the review again.`, { cause: error });
      }
      console.warn(`[model-provider] ${provider.label} request failed; retry ${attempt + 1}/${maxRetries}`, error);
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw new Error(`${provider.label} request failed after retries.`);
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
    headers: providerHeaders(provider)
  };

  let requestProvider;
  if (provider.protocol === "responses") {
    requestProvider = () => fetchProvider(provider, `${baseUrl}/responses`, {
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
    requestProvider = () => fetchProvider(provider, `${baseUrl}/chat/completions`, {
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

  let response = await requestProvider();
  let payload;
  const malformedRetries = Math.min(2, Math.max(0, provider.maxRetries || 0));
  for (let attempt = 0; attempt <= malformedRetries; attempt += 1) {
    const rawBody = await response.text();
    try {
      payload = JSON.parse(rawBody);
      break;
    } catch {
      if (attempt < malformedRetries) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        response = await requestProvider();
        continue;
      }
      throw new Error(`${provider.label} is temporarily unavailable. Please run the review again.`);
    }
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
