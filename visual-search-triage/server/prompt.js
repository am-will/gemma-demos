import { jsonrepair } from "jsonrepair";

export function buildBatchPrompt({ description, images, batchIndex, batchCount }) {
  const imageList = images.map((image, index) => `${index + 1}. ${image.originalName}`).join("\n");
  return `You are an image search agent. Find images that match the user's target description.

Target description:
${description}

Batch ${batchIndex + 1} of ${batchCount}. Images in this batch:
${imageList}

Return only valid JSON with this exact shape:
{
  "query": "the user's target description",
  "matches": [
    {
      "filename": "exact filename from the image list",
      "rank": 1,
      "confidence": 0.0,
      "why_match": "one concise sentence",
      "visible_evidence": "specific visual evidence",
      "possible_false_positive": "what could make this wrong"
    }
  ],
  "misses": [
    {
      "filename": "exact filename from the image list",
      "reason": "why it does not match"
    }
  ],
  "summary": "concise summary of the batch"
}

Rules:
- Include every image in either matches or misses.
- Use confidence from 0 to 1.
- Rank only the matching images.
- Prefer precise visible evidence over speculation.
- Do not include markdown fences.`;
}

export function normalizeProviderResults({ provider, batches }) {
  const matches = [];
  const misses = [];
  const summaries = [];

  for (const batch of batches) {
    if (Array.isArray(batch.parsed?.matches)) {
      for (const item of batch.parsed.matches) {
        matches.push({
          provider,
          filename: String(item.filename || "").trim(),
          rank: Number(item.rank || matches.length + 1),
          confidence: clampConfidence(item.confidence),
          why_match: String(item.why_match || item.reason || "").trim(),
          visible_evidence: String(item.visible_evidence || "").trim(),
          possible_false_positive: String(item.possible_false_positive || "").trim(),
          imageUrl: String(item.imageUrl || "").trim(),
          batch: batch.batchIndex + 1
        });
      }
    }
    if (Array.isArray(batch.parsed?.misses)) {
      for (const item of batch.parsed.misses) {
        misses.push({
          provider,
          filename: String(item.filename || "").trim(),
          reason: String(item.reason || "").trim(),
          batch: batch.batchIndex + 1
        });
      }
    }
    if (batch.parsed?.summary) summaries.push(String(batch.parsed.summary));
  }

  matches.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: "base" }));
  matches.forEach((match, index) => {
    match.rank = index + 1;
  });

  return {
    matches,
    misses,
    summary: summaries.join(" "),
    batches
  };
}

export function attachImageUrls(parsed, images) {
  const byName = new Map(images.map((image) => [image.originalName, image]));
  const withUrls = structuredClone(parsed);
  if (Array.isArray(withUrls.matches)) {
    withUrls.matches = withUrls.matches.map((match) => {
      const image = byName.get(String(match.filename || "").trim());
      return image ? { ...match, imageUrl: image.previewUrl } : match;
    });
  }
  return withUrls;
}

export function parseJsonFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("Provider returned an empty response.");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : extractJsonObject(raw);
  try {
    return JSON.parse(candidate);
  } catch {
    return JSON.parse(jsonrepair(candidate));
  }
}

function extractJsonObject(text) {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return text;
  return text.slice(first, last + 1);
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
