export const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string" },
    status: { type: "string" },
    summary: { type: "string" },
    change: { type: "string" },
    primaryFinding: { type: "string" },
    impact: { type: "string" },
    nextAction: { type: "string" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    metrics: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          tone: { type: "string", enum: ["neutral", "positive", "negative", "warning"] }
        },
        required: ["label", "value", "tone"]
      }
    },
    sources: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" }
    }
  },
  required: [
    "headline",
    "status",
    "summary",
    "change",
    "primaryFinding",
    "impact",
    "nextAction",
    "confidence",
    "metrics",
    "sources"
  ]
};
