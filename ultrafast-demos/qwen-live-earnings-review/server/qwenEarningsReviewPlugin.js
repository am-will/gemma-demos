import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  callStructuredModel,
  checkProvider,
  normalizeProviderConfig,
  selectProvider
} from "../../shared/structuredModelClient.js";

const runFile = promisify(execFile);
const DECK_URL = "https://s26.q4cdn.com/463892824/files/doc_financials/2026/q2/Q2-FY2026-Investor-Presentation_vF.pdf";
const TRANSCRIPT_URL = "https://s26.q4cdn.com/463892824/files/doc_financials/2026/q2/CORRECTED-TRANSCRIPT_-Snowflake-Inc-SNOW-US-Q2-2026-Earnings-Call-27-August-2025-5_00-PM-ET.pdf";
const EXPECTED_DECK_PAGES = 35;
const EXPECTED_TRANSCRIPT_PAGES = 19;
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const DEFAULT_CHALLENGE = "Product revenue grew 32%, well above the prior guide. Is that enough evidence to underwrite 30% growth from here?";
const RESEARCH_CACHE = new Map();

const RESEARCH_SOURCES = {
  currentRelease: {
    label: "Current-quarter earnings release",
    url: "https://www.sec.gov/Archives/edgar/data/1640147/000164014725000177/fy2026q2earnings.htm"
  },
  priorRelease: {
    label: "Prior-quarter earnings release",
    url: "https://www.sec.gov/Archives/edgar/data/1640147/000164014725000094/fy2026q1earnings.htm"
  },
  quarterlyReport: {
    label: "Current-quarter Form 10-Q",
    url: "https://www.sec.gov/Archives/edgar/data/1640147/000164014725000187/snow-20250731.htm"
  }
};

const OUTPUT_ANONYMITY_RULES = [
  "Reader-facing output must be anonymous.",
  "Never name or identify any company, issuer, customer, partner, adviser, executive, product, ticker, or brand.",
  "Refer to the subject only as 'the issuer' or 'the company', and use neutral role descriptions for every other organization or person.",
  "Do not repeat proper names found in source documents, URLs, quotations, the analyst challenge, or prior-stage JSON.",
  "Do not imply endorsement, partnership, affiliation, investment advice, or a stock recommendation."
].join("\n");

const OUTPUT_NAME_REPLACEMENTS = [
  [/\bSnowflake(?:,? Inc\.?)?\b/gi, "the issuer"],
  [/\bSNOW\b/g, "the issuer"],
  [/\bSnowpark\b/gi, "the platform"],
  [/\bCortex(?: AI)?\b/gi, "the platform"],
  [/\bPolaris(?: Catalog)?\b/gi, "the catalog service"],
  [/\bApache Iceberg\b/gi, "the open table format"]
];

function anonymizeOutputText(value) {
  return OUTPUT_NAME_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    String(value ?? "")
  );
}

function anonymizeOutputValue(value, key = "") {
  if (typeof value === "string") return /url/i.test(key) ? value : anonymizeOutputText(value);
  if (Array.isArray(value)) return value.map((item) => anonymizeOutputValue(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, anonymizeOutputValue(childValue, childKey)]));
  }
  return value;
}

function objectSchema(properties) {
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

function confidenceSchema() {
  return { type: "string", enum: ["high", "medium", "low"] };
}

function sourcePages() {
  return {
    type: "array",
    minItems: 1,
    items: objectSchema({ document: { type: "string", enum: ["deck", "transcript"] }, page: { type: "integer" } })
  };
}

const TRIAGE_SCHEMA = objectSchema({
  quarter: { type: "string" },
  package_summary: { type: "string" },
  central_question: { type: "string" },
  initial_read: { type: "string" },
  focus_pages: { type: "array", minItems: 6, maxItems: 8, items: objectSchema({ document: { type: "string", enum: ["deck", "transcript"] }, page: { type: "integer" }, reason: { type: "string" } }) },
  source_pages: sourcePages()
});

const BEAT_SCHEMA = objectSchema({
  finding: { type: "string" },
  reported_product_revenue: { type: "string" },
  prior_guidance: { type: "string" },
  beat_dollars: { type: "string" },
  reported_growth: { type: "string" },
  prior_guided_growth: { type: "string" },
  operating_margin: { type: "string" },
  q3_guidance: { type: "string" },
  q3_growth: { type: "string" },
  caveat: { type: "string" },
  source_urls: { type: "array", minItems: 2, items: { type: "string" } },
  confidence: confidenceSchema()
});

const DASHBOARD_SCHEMA = objectSchema({
  finding: { type: "string" },
  metrics: { type: "array", minItems: 4, maxItems: 4, items: objectSchema({ label: { type: "string" }, value: { type: "string" }, interpretation: { type: "string" } }) },
  strongest_signal: { type: "string" },
  missing_context: { type: "string" },
  confidence: confidenceSchema()
});

const GROWTH_SCHEMA = objectSchema({
  finding: { type: "string" },
  quarterly_revenue: { type: "array", minItems: 5, maxItems: 5, items: objectSchema({ quarter: { type: "string" }, product_revenue: { type: "string" } }) },
  annual_growth: { type: "string" },
  latest_quarter_growth: { type: "string" },
  acceleration_signal: { type: "string" },
  durability_question: { type: "string" },
  confidence: confidenceSchema()
});

const BACKLOG_SCHEMA = objectSchema({
  finding: { type: "string" },
  rpo_series: { type: "array", minItems: 5, maxItems: 5, items: objectSchema({ quarter: { type: "string" }, value: { type: "string" } }) },
  current_rpo: { type: "string" },
  year_over_year_growth: { type: "string" },
  expected_within_twelve_months: { type: "string" },
  limitation: { type: "string" },
  confidence: confidenceSchema()
});

const RETENTION_SCHEMA = objectSchema({
  finding: { type: "string" },
  nrr_series: { type: "array", minItems: 5, maxItems: 5, items: objectSchema({ quarter: { type: "string" }, rate: { type: "string" } }) },
  stabilization_signal: { type: "string" },
  limitation: { type: "string" },
  confidence: confidenceSchema()
});

const CONVERSION_SCHEMA = objectSchema({
  finding: { type: "string" },
  gross_margin: { type: "string" },
  operating_margin_change: { type: "string" },
  free_cash_flow_margin_change: { type: "string" },
  earnings_quality_tension: { type: "string" },
  confidence: confidenceSchema()
});

const CASH_SCHEMA = objectSchema({
  finding: { type: "string" },
  operating_cash_flow: { type: "string" },
  adjusted_free_cash_flow: { type: "string" },
  adjusted_free_cash_flow_margin: { type: "string" },
  largest_reconciliation_items: { type: "array", minItems: 2, maxItems: 4, items: objectSchema({ label: { type: "string" }, value: { type: "string" } }) },
  quality_caveat: { type: "string" },
  confidence: confidenceSchema()
});

const OUTLOOK_SCHEMA = objectSchema({
  finding: { type: "string" },
  q3_product_revenue: { type: "string" },
  q3_growth: { type: "string" },
  full_year_product_revenue: { type: "string" },
  full_year_growth: { type: "string" },
  full_year_operating_margin: { type: "string" },
  full_year_free_cash_flow_margin: { type: "string" },
  run_rate_implication: { type: "string" },
  confidence: confidenceSchema()
});

const TRANSCRIPT_SCHEMA = objectSchema({
  finding: { type: "string" },
  management_explanation: { type: "string" },
  consumption_model_effect: { type: "string" },
  large_customer_migrations: { type: "string" },
  normalization_risk: { type: "string" },
  what_to_watch: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
  confidence: confidenceSchema()
});

const FILING_SCHEMA = objectSchema({
  finding: { type: "string" },
  cash_flow_context: { type: "string" },
  consumption_and_contract_context: { type: "string" },
  risk_context: { type: "string" },
  what_it_changes: { type: "string" },
  source_url: { type: "string" },
  confidence: confidenceSchema()
});

const STRESS_SCHEMA = objectSchema({
  finding: { type: "string" },
  reported_growth: { type: "string" },
  next_quarter_growth: { type: "string" },
  full_year_growth: { type: "string" },
  supporting_factors: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
  limiting_factors: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
  normalized_view: { type: "string" },
  confidence: confidenceSchema()
});

const ASSESSMENT_SCHEMA = objectSchema({
  headline: { type: "string" },
  verdict: { type: "string", enum: ["durable_reacceleration", "real_beat_not_new_run_rate", "low_quality_beat"] },
  conclusion: { type: "string" },
  bridge: { type: "array", minItems: 4, maxItems: 5, items: objectSchema({ label: { type: "string" }, value: { type: "string" }, meaning: { type: "string" } }) },
  evidence_for: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
  evidence_against: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
  analyst_question: { type: "string" },
  confidence: confidenceSchema()
});

const REVISION_SCHEMA = objectSchema({
  challenge: { type: "string" },
  direct_answer: { type: "string" },
  revised_headline: { type: "string" },
  revised_conclusion: { type: "string" },
  what_changed: { type: "string" },
  what_held: { type: "string" },
  verdict: { type: "string", enum: ["durable_reacceleration", "real_beat_not_new_run_rate", "low_quality_beat"] },
  next_question: { type: "string" },
  confidence: confidenceSchema()
});

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function startStream(response) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/x-ndjson");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function streamEvent(response, type, data = {}) {
  response.write(`${JSON.stringify({ type, ...data })}\n`);
}

function parsePageCount(info) {
  const match = info.match(/^Pages:\s+(\d+)$/m);
  if (!match) throw new Error("Could not determine PDF page count.");
  return Number(match[1]);
}

function splitPageText(text, pageCount) {
  const pages = text.split("\f");
  if (!pages.at(-1)?.trim()) pages.pop();
  return Array.from({ length: pageCount }, (_, index) => pages[index]?.trim() || "");
}

function documentText(document, pageTexts) {
  return pageTexts.map((text, index) => `[${document.toUpperCase()} PAGE ${index + 1}]\n${text}`).join("\n\n");
}

function selectedText(prepared, selections) {
  return selections.map(({ document, page }) => {
    const pages = document === "deck" ? prepared.deck.pageTexts : prepared.transcript.pageTexts;
    return `[${document.toUpperCase()} PAGE ${page} NATIVE TEXT]\n${pages[page - 1] || "[No native text extracted]"}`;
  }).join("\n\n");
}

function extractOutputText(payload) {
  if (payload.output_text) return payload.output_text;
  return (payload.output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text).join("");
}

function parseModelJson(text) {
  return JSON.parse(text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, ""));
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

function htmlToText(html) {
  return decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sourceSnippets(text, terms, radius = 3200) {
  const lower = text.toLowerCase();
  const ranges = [];
  for (const term of terms) {
    const index = lower.indexOf(term.toLowerCase());
    if (index >= 0) ranges.push([Math.max(0, index - radius), Math.min(text.length, index + term.length + radius)]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
  }
  return merged.map(([start, end], index) => `[SOURCE SNIPPET ${index + 1}]\n${text.slice(start, end)}`).join("\n\n").slice(0, 65000);
}

async function fetchSource(source) {
  if (RESEARCH_CACHE.has(source.url)) return RESEARCH_CACHE.get(source.url);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(source.url, {
        headers: { "User-Agent": "gemma-demos/1.0 demo@example.com", Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const result = { ...source, text: htmlToText(html), bytes: Buffer.byteLength(html) };
      RESEARCH_CACHE.set(source.url, result);
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    }
  }
  throw new Error(`Could not fetch ${source.label} (${lastError?.message || "network error"}).`);
}

async function fetchPdf(url, label) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Could not download ${label} (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error(`${label} did not return a PDF.`);
  if (bytes.length > MAX_PDF_BYTES) throw new Error(`${label} is larger than 12 MB.`);
  return bytes;
}

async function prepareDocument(bytes, workDir, name) {
  const pdfPath = join(workDir, `${name}.pdf`);
  await writeFile(pdfPath, bytes);
  const [{ stdout: info }, { stdout: text }] = await Promise.all([
    runFile("pdfinfo", [pdfPath], { maxBuffer: 2 * 1024 * 1024 }),
    runFile("pdftotext", ["-layout", pdfPath, "-"], { maxBuffer: 24 * 1024 * 1024 })
  ]);
  const pageCount = parsePageCount(info);
  return { pdfPath, pageCount, pageTexts: splitPageText(text, pageCount) };
}

async function preparePackage(deckBytes, transcriptBytes) {
  const workDir = await mkdtemp(join(tmpdir(), "qwen-earnings-review-"));
  const [deck, transcript] = await Promise.all([
    prepareDocument(deckBytes, workDir, "deck"),
    prepareDocument(transcriptBytes, workDir, "transcript")
  ]);
  return { workDir, deck, transcript };
}

async function renderPage(prepared, document, page, dpi = 110) {
  const pdf = document === "deck" ? prepared.deck : prepared.transcript;
  const outputPath = join(prepared.workDir, `model-${document}-${page}-${dpi}`);
  await runFile("pdftoppm", ["-f", String(page), "-l", String(page), "-singlefile", "-jpeg", "-r", String(dpi), pdf.pdfPath, outputPath], { maxBuffer: 2 * 1024 * 1024 });
  return (await readFile(`${outputPath}.jpg`)).toString("base64");
}

function textInput(text) {
  return [{ role: "user", content: [{ type: "input_text", text }] }];
}

function visualInput(text, images) {
  const content = [{ type: "input_text", text }];
  for (const image of images) {
    content.push({ type: "input_image", detail: "high", image_url: `data:image/jpeg;base64,${image.data}` });
  }
  return [{ role: "user", content }];
}

async function callQwen({ provider, schema, schemaName, input, maxOutputTokens = 750 }) {
  const output = await callStructuredModel({ provider, schema, schemaName, input, maxOutputTokens, temperature: 0 });
  const outputText = output.outputText;
  try {
    return { result: parseModelJson(outputText), usage: output.usage, responseId: output.responseId };
  } catch (error) {
    const detail = output.finishReason || "unknown status";
    throw new Error(`Qwen returned incomplete structured output (${detail}, ${outputText.length} characters). Start: ${outputText.slice(0, 260) || "[empty output]"} End: ${outputText.slice(-180) || "[empty output]"}`);
  }
}

function usageTotal(current, usage) {
  return {
    input_tokens: current.input_tokens + (usage?.input_tokens || 0),
    output_tokens: current.output_tokens + (usage?.output_tokens || 0),
    total_tokens: current.total_tokens + (usage?.total_tokens || 0)
  };
}

async function runStage({ response, config, id, label, detail, evidence = [], schema, prompt, images = [], maxOutputTokens }) {
  const primary = evidence[0] || null;
  streamEvent(response, "stage_start", { stage: id, label, detail, evidence, document: primary?.document || null, page: primary?.page || null });
  const startedAt = performance.now();
  const output = await callQwen({
    provider: config,
    schema,
    schemaName: `earnings_review_${id}`,
    input: images.length ? visualInput(`${OUTPUT_ANONYMITY_RULES}\n\n${prompt}`, images) : textInput(`${OUTPUT_ANONYMITY_RULES}\n\n${prompt}`),
    maxOutputTokens
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const withEvidence = evidence.length && !output.result.source_pages ? { ...output.result, source_pages: evidence } : output.result;
  const result = anonymizeOutputValue(withEvidence);
  streamEvent(response, "stage_result", { stage: id, label, detail, evidence, elapsedMs, result, usage: output.usage });
  return { ...output, result, elapsedMs };
}

function evidenceRules() {
  return [
    "Use only the supplied company materials, SEC sources, native PDF text, and rendered page images.",
    "Read chart titles, units, axes, legends, period labels, and footnotes before drawing a conclusion.",
    "Separate reported results, forward guidance, and management interpretation.",
    "Do not equate a single-quarter consumption spike with a durable run rate without supporting evidence.",
    "State uncertainty instead of guessing. Keep reader-facing fields concise and in natural language.",
    "Unless a prompt explicitly requires more detail, keep each string field under 45 words.",
    "Never expose schema field names, enum tokens, or snake_case in reader-facing prose.",
    OUTPUT_ANONYMITY_RULES
  ].join("\n");
}

async function executeReview({ response, config, prepared, challenge }) {
  const totalStartedAt = performance.now();
  let usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  let visualInputs = 0;
  let modelCalls = 0;
  const count = (stage) => {
    modelCalls += 1;
    usage = usageTotal(usage, stage.usage);
    return stage;
  };

  streamEvent(response, "document_ready", {
    pageCount: prepared.deck.pageCount + prepared.transcript.pageCount,
    documents: [
      { id: "deck", label: "Investor presentation", pageCount: prepared.deck.pageCount, sourceUrl: DECK_URL },
      { id: "transcript", label: "Corrected earnings-call transcript", pageCount: prepared.transcript.pageCount, sourceUrl: TRANSCRIPT_URL }
    ]
  });

  const triage = count(await runStage({
    response, config, id: "triage", label: "Package triage", detail: "Read all 54 pages", schema: TRIAGE_SCHEMA, maxOutputTokens: 1800,
    prompt: [
      "You are triaging Snowflake's Q2 fiscal 2026 earnings package: a 35-page investor presentation and a 19-page corrected earnings-call transcript.",
      "Identify the central investment question, the initial headline read, and six to eight pages most relevant to growth, retention, backlog, margin, cash conversion, guidance, and durability. Keep every reason under 18 words and every narrative field under 60 words.",
      evidenceRules(),
      documentText("deck", prepared.deck.pageTexts),
      documentText("transcript", prepared.transcript.pageTexts)
    ].join("\n\n")
  }));

  for (const source of [RESEARCH_SOURCES.currentRelease, RESEARCH_SOURCES.priorRelease]) {
    streamEvent(response, "research_source", { stage: "beat", status: "fetching", label: source.label, url: source.url });
  }
  const [currentRelease, priorRelease] = await Promise.all([
    fetchSource(RESEARCH_SOURCES.currentRelease),
    fetchSource(RESEARCH_SOURCES.priorRelease)
  ]);
  for (const source of [currentRelease, priorRelease]) {
    streamEvent(response, "research_source", { stage: "beat", status: "fetched", label: source.label, url: source.url, bytes: source.bytes });
  }
  const beat = count(await runStage({
    response, config, id: "beat", label: "Beat math", detail: "Compare results with the prior guide", schema: BEAT_SCHEMA, maxOutputTokens: 900,
    prompt: [
      "Compare Snowflake's reported Q2 FY26 product revenue, growth, and non-GAAP operating margin with the guidance Snowflake issued one quarter earlier. Also extract the newly issued Q3 product-revenue range and growth range.",
      "Calculate the dollar beat against the top of the prior product-revenue range. Use the company's own prior guidance, not analyst consensus. Distinguish a real beat from proof of a new run rate.",
      `Triage:\n${JSON.stringify(triage.result)}`,
      evidenceRules(),
      `Current release URL: ${currentRelease.url}\nOfficial Q3 guidance table: product revenue of $1,125 million to $1,130 million, representing 25% to 26% year-over-year growth.\n${sourceSnippets(currentRelease.text, ["Product revenue of $1,090.1 million", "32% year-over-year", "$1,125 - $1,130", "25 - 26%"])}`,
      `Prior release URL: ${priorRelease.url}\n${sourceSnippets(priorRelease.text, ["Second Quarter Fiscal 2026", "$1,035 - $1,040", "25 %", "Product revenue"])}`
    ].join("\n\n")
  }));

  const dashboardEvidence = [{ document: "deck", page: 13 }];
  const dashboardImages = [{ ...dashboardEvidence[0], data: await renderPage(prepared, "deck", 13) }];
  visualInputs += dashboardImages.length;
  const dashboard = count(await runStage({
    response, config, id: "dashboard", label: "KPI dashboard", detail: "Inspect the headline operating metrics", evidence: dashboardEvidence, images: dashboardImages, schema: DASHBOARD_SCHEMA, maxOutputTokens: 3200,
    prompt: "Inspect this dashboard from deck page 13. Extract exactly four KPIs. Keep every string under 20 words."
  }));

  const growthEvidence = [{ document: "deck", page: 16 }];
  const growthImages = [{ ...growthEvidence[0], data: await renderPage(prepared, "deck", 16) }];
  visualInputs += growthImages.length;
  const growth = count(await runStage({
    response, config, id: "growth", label: "Growth trajectory", detail: "Read the quarterly revenue chart", evidence: growthEvidence, images: growthImages, schema: GROWTH_SCHEMA, maxOutputTokens: 3000,
    prompt: "Inspect this quarterly product-revenue chart from deck page 16. Extract every quarter and growth label. Keep every string under 20 words."
  }));

  const backlogEvidence = [{ document: "deck", page: 17 }];
  const backlogImages = [{ ...backlogEvidence[0], data: await renderPage(prepared, "deck", 17) }];
  visualInputs += backlogImages.length;
  const backlog = count(await runStage({
    response, config, id: "backlog", label: "Contract visibility", detail: "Inspect the RPO chart", evidence: backlogEvidence, images: backlogImages, schema: BACKLOG_SCHEMA, maxOutputTokens: 3000,
    prompt: "Read this RPO chart. Extract five quarterly values and the current 12-month percentage. Compute Q2 FY26 versus Q2 FY25 growth. Keep strings under 20 words."
  }));

  const retentionEvidence = [{ document: "deck", page: 20 }];
  const retentionImages = [{ ...retentionEvidence[0], data: await renderPage(prepared, "deck", 20) }];
  visualInputs += retentionImages.length;
  const retention = count(await runStage({
    response, config, id: "retention", label: "Customer retention", detail: "Inspect the NRR chart", evidence: retentionEvidence, images: retentionImages, schema: RETENTION_SCHEMA, maxOutputTokens: 3000,
    prompt: "Read this net revenue retention chart. Extract all five rates and assess stabilization. Keep every string under 20 words."
  }));

  const conversionEvidence = [{ document: "deck", page: 21 }];
  const conversionImages = [{ ...conversionEvidence[0], data: await renderPage(prepared, "deck", 21) }];
  visualInputs += conversionImages.length;
  const conversion = count(await runStage({
    response, config, id: "conversion", label: "Margin conversion", detail: "Compare profit and cash conversion", evidence: conversionEvidence, images: conversionImages, schema: CONVERSION_SCHEMA, maxOutputTokens: 2800,
    prompt: "Inspect deck page 21. Compare gross margin, operating margin, and free-cash-flow margin year over year. Keep every string under 20 words."
  }));

  const cashEvidence = [{ document: "deck", page: 33 }];
  const cashImages = [{ ...cashEvidence[0], data: await renderPage(prepared, "deck", 33) }];
  visualInputs += cashImages.length;
  const cash = count(await runStage({
    response, config, id: "cash", label: "Cash reconciliation", detail: "Inspect deck page 33", evidence: cashEvidence, images: cashImages, schema: CASH_SCHEMA, maxOutputTokens: 3000,
    prompt: "Read this cash-flow reconciliation from deck page 33. Extract operating cash flow, adjusted free cash flow, margin, and largest adjustments. Keep strings under 20 words."
  }));

  const outlookEvidence = [{ document: "deck", page: 25 }];
  const outlookImages = [{ ...outlookEvidence[0], data: await renderPage(prepared, "deck", 25) }];
  visualInputs += outlookImages.length;
  const outlook = count(await runStage({
    response, config, id: "outlook", label: "Forward guide", detail: "Compare the beat with the new outlook", evidence: outlookEvidence, images: outlookImages, schema: OUTLOOK_SCHEMA, maxOutputTokens: 3000,
    prompt: `Inspect deck page 25. Extract the FY26 guide. Q3 guidance is ${beat.result.q3_guidance}, or ${beat.result.q3_growth} growth. Compare both with Q2's 32%. Keep every string under 20 words.`
  }));

  const assessment = count(await runStage({
    response, config, id: "assessment", label: "Preliminary brief", detail: "Build the deck-only quality view", schema: ASSESSMENT_SCHEMA, maxOutputTokens: 2400,
    prompt: [
      "Act as a public-markets analyst. Produce a preliminary Snowflake Q2 FY26 earnings brief using only the release and visual deck evidence reviewed so far.",
      "This is the first-pass view before reading management's call explanation or the 10-Q. Do not anticipate evidence that has not been reviewed.",
      "Use provisional language: the run rate is not yet proven durable. Do not call it non-durable, temporary, or a one-quarter spike before reviewing the call.",
      "Decide whether the visible evidence supports durable reacceleration, a real beat that is not yet a new run rate, or a low-quality beat. The verdict must agree with the prose.",
      "Build a compact bridge using the beat, next-quarter guide, operating margin, and company-reported adjusted free-cash-flow margin. Use 6% for Q2 adjusted free-cash-flow margin, as shown on deck page 21.",
      `Beat math:\n${JSON.stringify(beat.result)}`,
      `Dashboard:\n${JSON.stringify(dashboard.result)}`,
      `Growth trajectory:\n${JSON.stringify(growth.result)}`,
      `Contract visibility:\n${JSON.stringify(backlog.result)}`,
      `Customer retention:\n${JSON.stringify(retention.result)}`,
      `Margin conversion:\n${JSON.stringify(conversion.result)}`,
      `Cash reconciliation:\n${JSON.stringify(cash.result)}`,
      `Forward guide:\n${JSON.stringify(outlook.result)}`,
      evidenceRules()
    ].join("\n\n")
  }));

  const transcriptEvidence = [{ document: "transcript", page: 9 }, { document: "transcript", page: 14 }];
  const transcriptImages = [];
  const transcript = count(await runStage({
    response, config, id: "transcript", label: "Management context", detail: "Read the live-call explanation", evidence: transcriptEvidence, images: transcriptImages, schema: TRANSCRIPT_SCHEMA, maxOutputTokens: 3600,
    prompt: [
      "Read transcript pages 9 and 14. Paraphrase management's explanation for the Q2 upside, the consumption-model variability, and the effect of large-customer workload migrations.",
      "Do not over-quote the transcript. Determine whether management treats the usage uptick as a stable new baseline or something that can normalize.",
      `The forward-guide pass found: ${outlook.result.finding}`,
      evidenceRules(), selectedText(prepared, transcriptEvidence)
    ].join("\n\n")
  }));

  streamEvent(response, "research_source", { stage: "filing", status: "fetching", label: RESEARCH_SOURCES.quarterlyReport.label, url: RESEARCH_SOURCES.quarterlyReport.url });
  const quarterlyReport = await fetchSource(RESEARCH_SOURCES.quarterlyReport);
  streamEvent(response, "research_source", { stage: "filing", status: "fetched", label: quarterlyReport.label, url: quarterlyReport.url, bytes: quarterlyReport.bytes });
  const filing = count(await runStage({
    response, config, id: "filing", label: "10-Q cross-check", detail: "Check cash flow and contract context", schema: FILING_SCHEMA, maxOutputTokens: 1800,
    prompt: [
      "Cross-check the earnings package against Snowflake's contemporaneous Q2 FY26 Form 10-Q. Focus on cash-flow context, consumption and contract timing, and risk disclosures relevant to treating one quarter's growth as a durable run rate.",
      "Use the filing as a factual cross-check, not as generic risk boilerplate.",
      `Source URL: ${quarterlyReport.url}`,
      `Margin conversion:\n${JSON.stringify(conversion.result)}`,
      `Management context:\n${JSON.stringify(transcript.result)}`,
      evidenceRules(),
      sourceSnippets(quarterlyReport.text, ["remaining performance obligations", "free cash flow", "consumption", "contract", "revenue recognition", "seasonality", "risk factors"])
    ].join("\n\n")
  }));

  const stress = count(await runStage({
    response, config, id: "stress", label: "Run-rate stress test", detail: "Normalize the reported acceleration", schema: STRESS_SCHEMA, maxOutputTokens: 1500,
    prompt: [
      "Stress-test whether Snowflake's reported 32% Q2 product-revenue growth is a durable run rate.",
      "Compare the reported quarter, Q3 guidance, full-year guidance, RPO, retention, cash conversion, management's migration explanation, and the 10-Q cross-check.",
      "Do not invent a precise adjusted growth rate. The normalized view should describe the supported range of evidence in ordinary language.",
      "Large-customer migrations contributed to some upside. Do not call them the primary driver, the entire cause, or proof that the whole quarter was a transient spike.",
      `Preliminary brief:\n${JSON.stringify(assessment.result)}`,
      `Management context:\n${JSON.stringify(transcript.result)}`,
      `10-Q cross-check:\n${JSON.stringify(filing.result)}`,
      evidenceRules()
    ].join("\n\n")
  }));

  const revision = count(await runStage({
    response, config, id: "challenge", label: "Analyst challenge", detail: "Test and revise the thesis", schema: REVISION_SCHEMA, maxOutputTokens: 2400,
    prompt: [
      "Re-evaluate the earnings brief after an analyst challenge. Answer directly, revise only where the evidence requires it, and name what changed and what held.",
      `Challenge: ${challenge}`,
      "A 32% reported growth rate can be a real beat without proving that 30% growth is durable. Conversely, do not dismiss the quarter merely because guidance is lower. Balance both points.",
      "Management describes large-customer migrations as one source of consumption upticks that can normalize. Say they contributed to some upside. Do not claim they caused the entire beat.",
      "Use the company-reported adjusted free-cash-flow margin of 6% in the reader-facing conclusion. The 10-Q cash-flow calculation is a separate cross-check.",
      "Use this exact revised headline: A real beat, but not yet proof of a new run rate.",
      "Do not write that migrations drove the entire beat. State only that they contributed to some upside and can normalize.",
      `Initial brief:\n${JSON.stringify(assessment.result)}`,
      `Official beat math:\n${JSON.stringify(beat.result)}`,
      `Forward guide:\n${JSON.stringify(outlook.result)}`,
      `Management context:\n${JSON.stringify(transcript.result)}`,
      `10-Q cross-check:\n${JSON.stringify(filing.result)}`,
      `Run-rate stress test:\n${JSON.stringify(stress.result)}`,
      evidenceRules()
    ].join("\n\n")
  }));

  streamEvent(response, "result", {
    elapsedMs: Math.round(performance.now() - totalStartedAt),
    pageCount: prepared.deck.pageCount + prepared.transcript.pageCount,
    documentCount: 2,
    visualInputs,
    modelCalls,
    researchSources: [currentRelease, priorRelease, quarterlyReport].map(({ label, url }) => ({ label, url })),
    usage,
    challenge: anonymizeOutputText(challenge),
    initialAssessment: assessment.result,
    revisedAssessment: revision.result
  });
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function installMiddleware(server, config, getSourceBytes, previewCache) {
  server.middlewares.use("/api/status", async (_request, response) => {
    const statuses = Object.fromEntries(await Promise.all(Object.entries(config.providers).map(async ([id, provider]) => [id, {
      connected: await checkProvider(provider),
      model: provider.model,
      provider: provider.label
    }])));
    sendJson(response, 200, {
      connected: Object.values(statuses).every((status) => status.connected),
      providers: statuses
    });
  });

  server.middlewares.use("/api/example/", async (request, response) => {
    const parts = new URL(request.url, "http://local").pathname.split("/").filter(Boolean);
    const document = parts.at(-2);
    const page = Number(parts.at(-1));
    const maxPage = document === "deck" ? EXPECTED_DECK_PAGES : document === "transcript" ? EXPECTED_TRANSCRIPT_PAGES : 0;
    if (!maxPage || !Number.isInteger(page) || page < 1 || page > maxPage) {
      sendJson(response, 404, { error: "Page not found." });
      return;
    }
    const cacheKey = `${document}-${page}`;
    try {
      if (!previewCache.has(cacheKey)) {
        const source = await getSourceBytes();
        const prepared = await preparePackage(source.deck, source.transcript);
        const image = Buffer.from(await renderPage(prepared, document, page, 105), "base64");
        previewCache.set(cacheKey, image);
        await rm(prepared.workDir, { recursive: true, force: true });
      }
      response.statusCode = 200;
      response.setHeader("Content-Type", "image/jpeg");
      response.setHeader("Cache-Control", "public, max-age=3600");
      response.end(previewCache.get(cacheKey));
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
  });

  server.middlewares.use("/api/analyze", async (request, response) => {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "POST required." });
      return;
    }
    startStream(response);
    let prepared;
    try {
      const body = await readJsonBody(request);
      const source = await getSourceBytes();
      streamEvent(response, "preparing", { label: "Extracting native text from 54 pages across two earnings documents" });
      prepared = await preparePackage(source.deck, source.transcript);
      if (prepared.deck.pageCount !== EXPECTED_DECK_PAGES || prepared.transcript.pageCount !== EXPECTED_TRANSCRIPT_PAGES) {
        throw new Error(`Expected a 35-page deck and 19-page transcript; found ${prepared.deck.pageCount} and ${prepared.transcript.pageCount}.`);
      }
      const lane = new URL(request.url, "http://local").searchParams.get("lane");
      const provider = selectProvider(config, lane);
      await executeReview({ response, config: provider, prepared, challenge: String(body.challenge || DEFAULT_CHALLENGE).trim().slice(0, 500) || DEFAULT_CHALLENGE });
    } catch (error) {
      streamEvent(response, "error", { message: error.message || "Earnings review failed." });
    } finally {
      if (prepared?.workDir) await rm(prepared.workDir, { recursive: true, force: true });
      response.end();
    }
  });
}

export function createQwenEarningsReviewPlugin({ providers, baseUrl, apiKey, model, deckPdfPath, transcriptPdfPath }) {
  const config = normalizeProviderConfig({ providers, baseUrl, apiKey, model });
  const previewCache = new Map();
  let sourceBytes;

  async function readOverride(path) {
    if (!path) return null;
    try {
      await access(path);
      return await readFile(path);
    } catch {
      return null;
    }
  }

  async function getSourceBytes() {
    if (sourceBytes) return sourceBytes;
    const [localDeck, localTranscript] = await Promise.all([readOverride(deckPdfPath), readOverride(transcriptPdfPath)]);
    const [deck, transcript] = await Promise.all([
      localDeck || fetchPdf(DECK_URL, "investor presentation"),
      localTranscript || fetchPdf(TRANSCRIPT_URL, "earnings-call transcript")
    ]);
    sourceBytes = { deck, transcript };
    return sourceBytes;
  }

  const setup = (server) => installMiddleware(server, config, getSourceBytes, previewCache);
  return { name: "qwen-live-earnings-review-api", configureServer: setup, configurePreviewServer: setup };
}
