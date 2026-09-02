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
const SOURCE_URL = "https://www.sec.gov/Archives/edgar/data/718937/000121390025095514/ea0259891-dfan14a_broadwood.pdf";
const EXPECTED_PAGES = 81;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const ANALYST_CHALLENGE = "Management says the revised projections are more reliable, and the $28 offer falls inside the revised DCF range. Does that make the transaction fair?";
const RESEARCH_SOURCES = {
  proxy: {
    label: "Definitive merger proxy",
    url: "https://www.sec.gov/Archives/edgar/data/718937/000119312525204396/d72691ddefm14a.htm"
  },
  companyResponse: {
    label: "Public response to merger opposition",
    url: "https://www.sec.gov/Archives/edgar/data/718937/000119312525219844/d911579ddefa14a.htm"
  },
  announcement: {
    label: "Official transaction announcement",
    url: "https://investors.staar.com/news-and-events/press-releases/2025/08-04-2025"
  }
};

const OUTPUT_ANONYMITY_RULES = [
  "Reader-facing output must be anonymous.",
  "Never name or identify any company, issuer, buyer, investor, stockholder, adviser, executive, product, ticker, or brand.",
  "Use neutral role descriptions such as 'the issuer', 'the buyer', 'the opposing stockholder', 'the financial adviser', and 'management'.",
  "Do not repeat proper names found in source documents, URLs, quotations, the analyst challenge, or prior-stage JSON.",
  "Brevity is mandatory at every stage: keep headline, finding, and question fields under 190 characters; keep every other reader-facing prose field under 320 characters and three sentences.",
  "State each point once. Do not repeat the headline in the supporting text or restate the same conclusion across fields.",
  "Do not imply endorsement, partnership, affiliation, investment advice, or a stock recommendation."
].join("\n");

const OUTPUT_NAME_REPLACEMENTS = [
  [/\bSTAAR Surgical(?: Company)?\b/gi, "the issuer"],
  [/\bSTAAR\b/gi, "the issuer"],
  [/\bAlcon(?: Inc\.?| AG)?\b/gi, "the buyer"],
  [/\bBroadwood Partners\b/gi, "the opposing stockholder"],
  [/\bBroadwood\b/gi, "the opposing stockholder"]
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

const TRIAGE_SCHEMA = objectSchema({
  document: { type: "string" },
  transaction: { type: "string" },
  offer_price: { type: "string" },
  core_question: { type: "string" },
  focus_pages: {
    type: "array",
    minItems: 4,
    maxItems: 8,
    items: objectSchema({ page: { type: "integer" }, reason: { type: "string" } })
  },
  initial_signals: { type: "array", minItems: 2, maxItems: 5, items: { type: "string" } },
  source_pages: pageArray()
});

const PROCESS_SCHEMA = objectSchema({
  finding: { type: "string" },
  staar_days: { type: "integer" },
  precedent_days: { type: "array", minItems: 7, maxItems: 7, items: { type: "integer" } },
  median_days: { type: "number" },
  half_median_days: { type: "number" },
  claim_is_mathematically_true: { type: "boolean" },
  peer_comparison: { type: "string" },
  evidence: { type: "string" },
  limitation: { type: "string" },
  source_pages: pageArray(),
  confidence: confidenceSchema()
});

const PROJECTION_SCHEMA = objectSchema({
  finding: { type: "string" },
  metrics: {
    type: "array",
    minItems: 4,
    maxItems: 6,
    items: objectSchema({
      metric: { type: "string" },
      period: { type: "string" },
      initial: { type: "string" },
      revised: { type: "string" },
      change: { type: "string" }
    })
  },
  stated_explanation: { type: "string" },
  open_question: { type: "string" },
  source_pages: pageArray(),
  confidence: confidenceSchema()
});

const DCF_SCHEMA = objectSchema({
  finding: { type: "string" },
  initial_range: { type: "string" },
  revised_range: { type: "string" },
  offer_position: { type: "string" },
  methodology_caveat: { type: "string" },
  source_pages: pageArray(),
  confidence: confidenceSchema()
});

const DISCOUNT_SCHEMA = objectSchema({
  finding: { type: "string" },
  advisor_rate: { type: "string" },
  comparison_rates: { type: "string" },
  valuation_effect: { type: "string" },
  caveat: { type: "string" },
  source_pages: pageArray(),
  confidence: confidenceSchema()
});

const ALTERNATIVE_SCHEMA = objectSchema({
  finding: { type: "string" },
  advisor_range: { type: "string" },
  revised_at_company_wacc_range: { type: "string" },
  initial_at_company_wacc_range: { type: "string" },
  offer_price: { type: "string" },
  source_pages: pageArray(),
  confidence: confidenceSchema()
});

const PROXY_RESEARCH_SCHEMA = objectSchema({
  source: { type: "string" },
  projection_revision_disclosure: { type: "string" },
  discount_rate_disclosure: { type: "string" },
  board_process_rationale: { type: "string" },
  what_it_confirms: { type: "string" },
  what_it_does_not_confirm: { type: "string" },
  source_url: { type: "string" },
  confidence: confidenceSchema()
});

const COMPANY_RESEARCH_SCHEMA = objectSchema({
  source: { type: "string" },
  offer_premium_case: { type: "string" },
  standalone_risks: { type: "string" },
  process_response: { type: "string" },
  valuation_response: { type: "string" },
  what_changes: { type: "string" },
  source_urls: { type: "array", minItems: 2, items: { type: "string" } },
  confidence: confidenceSchema()
});

const ASSESSMENT_SCHEMA = objectSchema({
  headline: { type: "string" },
  conclusion: { type: "string" },
  deal_view: { type: "string", enum: ["supports_offer", "opposes_offer", "insufficient_evidence"] },
  strongest_evidence: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
  counterargument: { type: "string" },
  unresolved_questions: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
  analyst_question: { type: "string" },
  source_pages: pageArray(),
  source_urls: { type: "array", minItems: 2, items: { type: "string" } },
  confidence: confidenceSchema()
});

const REVISION_SCHEMA = objectSchema({
  challenge: { type: "string" },
  answer: { type: "string" },
  revised_conclusion: { type: "string" },
  what_changed: { type: "string" },
  what_did_not_change: { type: "string" },
  decision: { type: "string", enum: ["supports_offer", "opposes_offer", "insufficient_evidence"] },
  source_pages: pageArray(),
  source_urls: { type: "array", minItems: 2, items: { type: "string" } },
  confidence: confidenceSchema()
});

function objectSchema(properties) {
  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties
  };
}

function pageArray() {
  return { type: "array", minItems: 1, items: { type: "integer" } };
}

function confidenceSchema() {
  return { type: "string", enum: ["high", "medium", "low"] };
}

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

function parsePageCount(pdfInfo) {
  const match = pdfInfo.match(/^Pages:\s+(\d+)$/m);
  if (!match) throw new Error("Could not determine the PDF page count.");
  return Number(match[1]);
}

function splitPageText(text, pageCount) {
  const rawPages = text.split("\f");
  if (!rawPages.at(-1)?.trim()) rawPages.pop();
  return Array.from({ length: pageCount }, (_, index) => rawPages[index]?.trim() || "");
}

function pageText(pageTexts, pages) {
  return pages
    .map((page) => `[PDF PAGE ${page} NATIVE TEXT]\n${pageTexts[page - 1] || "[No native text extracted]"}`)
    .join("\n\n");
}

function allPageText(pageTexts) {
  return pageTexts
    .map((text, index) => `[PDF PAGE ${index + 1}]\n${text}`)
    .join("\n\n");
}

function extractOutputText(payload) {
  if (payload.output_text) return payload.output_text;
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("");
}

function parseModelJson(text) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
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

function sourceSnippets(text, terms, radius = 4200) {
  const lower = text.toLowerCase();
  const ranges = [];
  for (const term of terms) {
    let cursor = 0;
    while (cursor < lower.length) {
      const index = lower.indexOf(term.toLowerCase(), cursor);
      if (index === -1) break;
      ranges.push([Math.max(0, index - radius), Math.min(text.length, index + term.length + radius)]);
      cursor = index + term.length;
      if (ranges.length >= 18) break;
    }
    if (ranges.length >= 18) break;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
  }
  const snippets = merged.map(([start, end], index) => `[SOURCE SNIPPET ${index + 1}]\n${text.slice(start, end)}`);
  return snippets.join("\n\n").slice(0, 70000);
}

async function fetchResearchSource(source) {
  const response = await fetch(source.url, {
    headers: { "User-Agent": "gemma-demos/1.0 demo@example.com" },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`Could not fetch ${source.label} (HTTP ${response.status}).`);
  const html = await response.text();
  return { ...source, text: htmlToText(html), bytes: Buffer.byteLength(html) };
}

function usageTotal(current, usage) {
  return {
    input_tokens: current.input_tokens + (usage?.input_tokens || 0),
    output_tokens: current.output_tokens + (usage?.output_tokens || 0),
    total_tokens: current.total_tokens + (usage?.total_tokens || 0)
  };
}

function normalizeProcessMath(result) {
  const values = [...result.precedent_days].sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  const halfMedian = median / 2;
  const claimIsTrue = result.staar_days < halfMedian;
  return {
    ...result,
    median_days: median,
    half_median_days: halfMedian,
    claim_is_mathematically_true: claimIsTrue,
    finding: claimIsTrue
      ? `The chart supports the narrow timing claim: the issuer's ${result.staar_days}-day process was less than half the ${median}-day median of the seven cited precedents. It does not establish that the process was inadequate.`
      : `The chart does not support the timing claim: the issuer's ${result.staar_days}-day process was not less than half the ${median}-day median of the seven cited precedents.`
  };
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

async function fetchExamplePdf() {
  const response = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "gemma-demos/1.0 demo@example.com" },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`Could not download the SEC exhibit (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("The SEC source did not return a PDF.");
  if (bytes.length > MAX_PDF_BYTES) throw new Error("The SEC exhibit is larger than 20 MB.");
  return bytes;
}

async function preparePdf(bytes) {
  const workDir = await mkdtemp(join(tmpdir(), "qwen-deal-review-"));
  const pdfPath = join(workDir, "source.pdf");
  await writeFile(pdfPath, bytes);
  const [{ stdout: info }, { stdout: text }] = await Promise.all([
    runFile("pdfinfo", [pdfPath], { maxBuffer: 2 * 1024 * 1024 }),
    runFile("pdftotext", ["-layout", pdfPath, "-"], { maxBuffer: 24 * 1024 * 1024 })
  ]);
  const pageCount = parsePageCount(info);
  return { workDir, pdfPath, pageCount, pageTexts: splitPageText(text, pageCount) };
}

async function renderPage(pdfPath, workDir, page, dpi = 132) {
  const outputPath = join(workDir, `model-page-${page}`);
  await runFile("pdftoppm", [
    "-f", String(page),
    "-singlefile",
    "-jpeg",
    "-r", String(dpi),
    "-jpegopt", "quality=84,optimize=y",
    pdfPath,
    outputPath
  ], { maxBuffer: 2 * 1024 * 1024 });
  return (await readFile(`${outputPath}.jpg`)).toString("base64");
}

function textInput(text) {
  return [{ role: "user", content: [{ type: "input_text", text }] }];
}

function visualInput(text, page, imageData) {
  return [{
    role: "user",
    content: [
      { type: "input_text", text },
      { type: "input_text", text: `PDF PAGE ${page} RENDERED IMAGE` },
      { type: "input_image", detail: "high", image_url: `data:image/jpeg;base64,${imageData}` }
    ]
  }];
}

async function callQwen({ provider, schema, schemaName, input, maxOutputTokens = 700 }) {
  const output = await callStructuredModel({
    provider,
    schema,
    schemaName,
    input,
    maxOutputTokens,
    temperature: 0.15
  });
  let result;
  try {
    result = parseModelJson(output.outputText);
  } catch {
    throw new Error(`${provider.label} returned incomplete structured output (${output.finishReason || "unknown status"}, ${output.outputText.length} characters).`);
  }
  return {
    result,
    usage: output.usage,
    responseId: output.responseId
  };
}

async function runStage({ response, config, id, label, detail, page = null, schema, prompt, imageData = null, maxOutputTokens, transformResult = null }) {
  streamEvent(response, "stage_start", { stage: id, label, detail, page });
  const startedAt = performance.now();
  const output = await callQwen({
    provider: config,
    schema,
    schemaName: `deal_review_${id}`,
    input: imageData ? visualInput(`${OUTPUT_ANONYMITY_RULES}\n\n${prompt}`, page, imageData) : textInput(`${OUTPUT_ANONYMITY_RULES}\n\n${prompt}`),
    maxOutputTokens
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const transformedResult = transformResult ? transformResult(output.result) : output.result;
  const result = anonymizeOutputValue(transformedResult);
  streamEvent(response, "stage_result", {
    stage: id,
    label,
    detail,
    page,
    elapsedMs,
    result,
    usage: output.usage
  });
  return { ...output, result, elapsedMs };
}

function evidenceRules() {
  return [
    "Treat this as a contested proxy-solicitation document, not neutral research.",
    "Separate claims made by the filer from facts directly visible in the cited chart or table.",
    "Use only evidence in the supplied native text and rendered page image.",
    "Read chart labels, legends, axes, footnotes, and source notes carefully.",
    "Cite PDF page numbers and state uncertainty instead of guessing.",
    "Keep every field concise and factual.",
    OUTPUT_ANONYMITY_RULES
  ].join("\n");
}

async function executeReview({ response, config, prepared, challenge }) {
  const totalStartedAt = performance.now();
  let totalUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  let visualInputs = 0;
  let modelCalls = 0;

  streamEvent(response, "document_ready", {
    pageCount: prepared.pageCount,
    filename: "Public transaction presentation",
    sourceUrl: SOURCE_URL
  });

  const triage = await runStage({
    response,
    config,
    id: "triage",
    label: "Document triage",
    detail: "Read all 81 pages and locate the valuation dispute",
    schema: TRIAGE_SCHEMA,
    maxOutputTokens: 1050,
    prompt: [
      "You are triaging an SEC-filed presentation about a proposed acquisition.",
      "Identify the transaction, offer price, central dispute, and the pages that contain the most decision-relevant evidence about sale process, management projections, discounted cash flow, and discount rate.",
      evidenceRules(),
      allPageText(prepared.pageTexts)
    ].join("\n\n")
  });
  modelCalls += 1;
  totalUsage = usageTotal(totalUsage, triage.usage);

  const processImage = await renderPage(prepared.pdfPath, prepared.workDir, 41);
  visualInputs += 1;
  const process = await runStage({
    response,
    config,
    id: "process",
    label: "Sale process review",
    detail: "Inspect the timeline and peer-process chart",
    page: 41,
    imageData: processImage,
    schema: PROCESS_SCHEMA,
    maxOutputTokens: 800,
    transformResult: normalizeProcessMath,
    prompt: [
      "Review PDF page 41 as a transaction-process analyst.",
      "Extract STAAR's process duration and exactly seven precedent durations as numbers. Compute the median and half-median, then verify the page's 'less than half the median' claim. Keep the arithmetic and the written finding internally consistent. Do not treat a true timing comparison as proof that the process itself was inadequate.",
      `Document triage:\n${JSON.stringify(triage.result)}`,
      evidenceRules(),
      pageText(prepared.pageTexts, [41])
    ].join("\n\n")
  });
  modelCalls += 1;
  totalUsage = usageTotal(totalUsage, process.usage);

  const projectionImage = await renderPage(prepared.pdfPath, prepared.workDir, 42);
  visualInputs += 1;
  const projections = await runStage({
    response,
    config,
    id: "projections",
    label: "Projection comparison",
    detail: "Read both chart series and calculate the changes",
    page: 42,
    imageData: projectionImage,
    schema: PROJECTION_SCHEMA,
    maxOutputTokens: 1000,
    prompt: [
      "Review PDF page 42. Extract the initial and revised values shown for net sales and adjusted EBITDA for every displayed year, including the direction and size of each revision.",
      "State whether the supplied page gives a concrete reason for the revision. Do not invent one.",
      `Document triage:\n${JSON.stringify(triage.result)}`,
      evidenceRules(),
      pageText(prepared.pageTexts, [42])
    ].join("\n\n")
  });
  modelCalls += 1;
  totalUsage = usageTotal(totalUsage, projections.usage);

  const dcfImage = await renderPage(prepared.pdfPath, prepared.workDir, 43);
  visualInputs += 1;
  const dcf = await runStage({
    response,
    config,
    id: "dcf",
    label: "DCF range review",
    detail: "Trace how the revised forecast changes implied value",
    page: 43,
    imageData: dcfImage,
    schema: DCF_SCHEMA,
    maxOutputTokens: 850,
    prompt: [
      "Review PDF page 43. Compare the DCF ranges based on the initial and revised projections and locate the proposed merger price within those ranges.",
      `The transaction offer identified during triage is ${triage.result.offer_price}. Do not confuse the offer with a chart endpoint or midpoint. Perform the numerical range comparison yourself and do not claim an offer marker is plotted unless it is actually visible.`,
      "Distinguish values sourced from the proxy from values estimated by the filer, using the footnotes.",
      `Projection comparison:\n${JSON.stringify(projections.result)}`,
      evidenceRules(),
      pageText(prepared.pageTexts, [43])
    ].join("\n\n")
  });
  modelCalls += 1;
  totalUsage = usageTotal(totalUsage, dcf.usage);

  const discountImage = await renderPage(prepared.pdfPath, prepared.workDir, 44);
  visualInputs += 1;
  const discount = await runStage({
    response,
    config,
    id: "discount",
    label: "Discount-rate review",
    detail: "Compare the advisor rate with external and peer estimates",
    page: 44,
    imageData: discountImage,
    schema: DISCOUNT_SCHEMA,
    maxOutputTokens: 850,
    prompt: [
      "Review PDF page 44. Extract the discount-rate range used in the fairness opinion, the comparison WACC estimates, and the claimed valuation effect.",
      "Call out what is measured directly and what is the filer's argument.",
      `DCF review:\n${JSON.stringify(dcf.result)}`,
      evidenceRules(),
      pageText(prepared.pageTexts, [44])
    ].join("\n\n")
  });
  modelCalls += 1;
  totalUsage = usageTotal(totalUsage, discount.usage);

  const alternativeImage = await renderPage(prepared.pdfPath, prepared.workDir, 45);
  visualInputs += 1;
  const alternatives = await runStage({
    response,
    config,
    id: "alternatives",
    label: "Alternative valuation",
    detail: "Test the offer under different projection and WACC assumptions",
    page: 45,
    imageData: alternativeImage,
    schema: ALTERNATIVE_SCHEMA,
    maxOutputTokens: 850,
    prompt: [
      "Review PDF page 45. Extract all three per-share valuation ranges and compare the $28 offer with each range.",
      "Perform each bounds check numerically: $28 is inside a range whenever the lower bound is less than or equal to 28 and the upper bound is greater than or equal to 28.",
      "Do not endorse the alternative ranges automatically. Note that they depend on assumptions described by the filer.",
      `Projection comparison:\n${JSON.stringify(projections.result)}`,
      `Discount-rate review:\n${JSON.stringify(discount.result)}`,
      evidenceRules(),
      pageText(prepared.pageTexts, [45])
    ].join("\n\n")
  });
  modelCalls += 1;
  totalUsage = usageTotal(totalUsage, alternatives.usage);

  streamEvent(response, "research_source", {
    stage: "proxyResearch",
    status: "fetching",
    label: RESEARCH_SOURCES.proxy.label,
    url: RESEARCH_SOURCES.proxy.url
  });
  const proxySource = await fetchResearchSource(RESEARCH_SOURCES.proxy);
  streamEvent(response, "research_source", {
    stage: "proxyResearch",
    status: "fetched",
    label: proxySource.label,
    url: proxySource.url,
    bytes: proxySource.bytes
  });
  const proxyResearch = await runStage({
    response,
    config,
    id: "proxyResearch",
    label: "Merger proxy research",
    detail: "Check the activist claims against the company's proxy",
    schema: PROXY_RESEARCH_SCHEMA,
    maxOutputTokens: 1250,
    prompt: [
      "Research the definitive merger proxy filed by STAAR Surgical. The analysis date is October 2, 2025; do not use later events or hindsight.",
      "Cross-check the activist deck's claims about when management revised projections, what the proxy says about that revision, the DCF discount-rate range, and the board's rationale for the process.",
      "Distinguish what the proxy confirms from what it does not establish. This is the company's filing and may also present management's perspective.",
      `Source URL: ${proxySource.url}`,
      `Activist projection finding:\n${JSON.stringify(projections.result)}`,
      `Activist DCF finding:\n${JSON.stringify(dcf.result)}`,
      evidenceRules(),
      sourceSnippets(proxySource.text, [
        "projections were updated",
        "financial projections",
        "discounted cash flow analysis",
        "discount rate",
        "13.4%",
        "14.6%",
        "weighted average cost of capital",
        "background of the merger",
        "revised projections",
        "stale"
      ])
    ].join("\n\n")
  });
  modelCalls += 1;
  totalUsage = usageTotal(totalUsage, proxyResearch.usage);

  streamEvent(response, "research_source", {
    stage: "companyResearch",
    status: "fetching",
    label: RESEARCH_SOURCES.companyResponse.label,
    url: RESEARCH_SOURCES.companyResponse.url
  });
  const [companySource, announcementSource] = await Promise.all([
    fetchResearchSource(RESEARCH_SOURCES.companyResponse),
    fetchResearchSource(RESEARCH_SOURCES.announcement)
  ]);
  for (const source of [companySource, announcementSource]) {
    streamEvent(response, "research_source", {
      stage: "companyResearch",
      status: "fetched",
      label: source.label,
      url: source.url,
      bytes: source.bytes
    });
  }
  const companyResearch = await runStage({
    response,
    config,
    id: "companyResearch",
    label: "Company countercase research",
    detail: "Review the premium, risk, process, and valuation response",
    schema: COMPANY_RESEARCH_SCHEMA,
    maxOutputTokens: 1250,
    prompt: [
      "Research STAAR's contemporaneous public case for the Alcon transaction using the official company response and transaction announcement. The analysis date is October 2, 2025; do not use later events or hindsight.",
      "Extract the strongest evidence-based countercase to the activist deck: the offer premium, standalone business risks, process response, and response on valuation assumptions.",
      "Separate company assertions from independently established facts and say what this new research changes.",
      `Company response URL: ${companySource.url}`,
      `Transaction announcement URL: ${announcementSource.url}`,
      `Activist assessment inputs:\n${JSON.stringify({ process: process.result, projections: projections.result, dcf: dcf.result, discount: discount.result, alternatives: alternatives.result })}`,
      evidenceRules(),
      `[COMPANY RESPONSE EXCERPTS]\n${sourceSnippets(companySource.text, [
        "59% premium",
        "standalone",
        "discount rate",
        "revised projections",
        "China",
        "no acquisition proposal",
        "window shop",
        "business risks"
      ])}`,
      `[TRANSACTION ANNOUNCEMENT]\n${sourceSnippets(announcementSource.text, [
        "$28 per share",
        "59% premium",
        "51% premium",
        "approximately $1.5 billion",
        "accretive"
      ], 2400)}`
    ].join("\n\n")
  });
  modelCalls += 1;
  totalUsage = usageTotal(totalUsage, companyResearch.usage);

  const assessment = await runStage({
    response,
    config,
    id: "assessment",
    label: "Cited deal brief",
    detail: "Synthesize the process, forecast, and valuation evidence",
    schema: ASSESSMENT_SCHEMA,
    maxOutputTokens: 1400,
    prompt: [
      "Act as a skeptical but balanced transaction analyst. Produce a concise cited assessment, as of October 2, 2025, of whether the evidence supports the $28 offer.",
      "The PDF is advocacy from an opposing stockholder. The web sources are company and transaction materials. Do not simply repeat either side. Weigh the visible evidence, limitations, and strongest counterargument.",
      "The deal_view field refers to the $28 offer itself. It must agree with the written conclusion: supports_offer, opposes_offer, or insufficient_evidence.",
      "Write every reader-facing field in normal human language. Never expose JSON field names, snake_case labels, or enum tokens in the headline, conclusion, evidence, counterargument, or open questions.",
      `Document triage:\n${JSON.stringify(triage.result)}`,
      `Sale-process review:\n${JSON.stringify(process.result)}`,
      `Projection comparison:\n${JSON.stringify(projections.result)}`,
      `DCF review:\n${JSON.stringify(dcf.result)}`,
      `Discount-rate review:\n${JSON.stringify(discount.result)}`,
      `Alternative valuation review:\n${JSON.stringify(alternatives.result)}`,
      `Definitive proxy research:\n${JSON.stringify(proxyResearch.result)}`,
      `Company countercase research:\n${JSON.stringify(companyResearch.result)}`,
      evidenceRules()
    ].join("\n\n")
  });
  modelCalls += 1;
  totalUsage = usageTotal(totalUsage, assessment.usage);

  const revision = await runStage({
    response,
    config,
    id: "challenge",
    label: "Analyst challenge",
    detail: "Answer the objection and revise the conclusion",
    schema: REVISION_SCHEMA,
    maxOutputTokens: 1300,
    prompt: [
      "Re-evaluate the deal assessment after an analyst challenge.",
      `Challenge: ${challenge}`,
      "Answer the challenge directly. Revise the conclusion only where the cited evidence requires it. Explain what changed and what did not.",
      "The answer and revised_conclusion must each be one concise paragraph of no more than three sentences. Lead with the direct answer and include only the most decision-relevant support.",
      "The decision field refers to the $28 offer itself and must logically match the answer and revised conclusion: supports_offer, opposes_offer, or insufficient_evidence. If the answer says fairness is not established, do not select supports_offer.",
      "Write every reader-facing field in normal human language. Never expose JSON field names, snake_case labels, or enum tokens in the answer, revised conclusion, what changed, or what did not change.",
      "The proxy research identifies a general rationale for the revised projections: further risk-adjusted expectations and emerging competition in China. Do not claim there was no explanation at all. You may say the explanation lacks granular support if the evidence warrants it. Do not allege manipulation without evidence.",
      `Initial deal assessment:\n${JSON.stringify(assessment.result)}`,
      `Projection comparison:\n${JSON.stringify(projections.result)}`,
      `DCF review:\n${JSON.stringify(dcf.result)}`,
      `Discount-rate review:\n${JSON.stringify(discount.result)}`,
      `Alternative valuation review:\n${JSON.stringify(alternatives.result)}`,
      `Definitive proxy research:\n${JSON.stringify(proxyResearch.result)}`,
      `Company countercase research:\n${JSON.stringify(companyResearch.result)}`,
      evidenceRules()
    ].join("\n\n")
  });
  modelCalls += 1;
  totalUsage = usageTotal(totalUsage, revision.usage);

  streamEvent(response, "result", {
    elapsedMs: Math.round(performance.now() - totalStartedAt),
    pageCount: prepared.pageCount,
    visualInputs,
    modelCalls,
    researchSources: [proxySource, companySource, announcementSource].map(({ label, url }) => ({ label, url })),
    usage: totalUsage,
    challenge: anonymizeOutputText(challenge),
    initialAssessment: assessment.result,
    revisedAssessment: revision.result
  });
}

function installMiddleware(server, config, getExampleBytes, pageCache) {
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

  server.middlewares.use("/api/example/page/", async (request, response) => {
    const page = Number(new URL(request.url, "http://local").pathname.split("/").pop());
    if (!Number.isInteger(page) || page < 1 || page > EXPECTED_PAGES) {
      sendJson(response, 404, { error: "Page not found." });
      return;
    }
    try {
      if (!pageCache.has(page)) {
        const bytes = await getExampleBytes();
        const workDir = await mkdtemp(join(tmpdir(), "qwen-deal-preview-"));
        const pdfPath = join(workDir, "source.pdf");
        await writeFile(pdfPath, bytes);
        const image = Buffer.from(await renderPage(pdfPath, workDir, page, 105), "base64");
        pageCache.set(page, image);
        await rm(workDir, { recursive: true, force: true });
      }
      response.statusCode = 200;
      response.setHeader("Content-Type", "image/jpeg");
      response.setHeader("Cache-Control", "public, max-age=3600");
      response.end(pageCache.get(page));
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
      const bytes = await getExampleBytes();
      streamEvent(response, "preparing", { label: "Extracting native text from the 81-page SEC exhibit" });
      prepared = await preparePdf(bytes);
      if (prepared.pageCount !== EXPECTED_PAGES) {
        throw new Error(`Expected the 81-page SEC exhibit, but found ${prepared.pageCount} pages.`);
      }
      const lane = new URL(request.url, "http://local").searchParams.get("lane");
      const provider = selectProvider(config, lane);
      await executeReview({
        response,
        config: provider,
        prepared,
        challenge: String(body.challenge || ANALYST_CHALLENGE).trim().slice(0, 500) || ANALYST_CHALLENGE
      });
    } catch (error) {
      streamEvent(response, "error", { message: error.message || "Deal review failed." });
    } finally {
      if (prepared?.workDir) await rm(prepared.workDir, { recursive: true, force: true });
      response.end();
    }
  });
}

export function createQwenDealReviewPlugin({ providers, baseUrl, apiKey, model, examplePdfPath }) {
  const config = normalizeProviderConfig({ providers, baseUrl, apiKey, model });
  const pageCache = new Map();
  let exampleBytes;

  async function getExampleBytes() {
    if (exampleBytes) return exampleBytes;
    if (examplePdfPath) {
      try {
        await access(examplePdfPath);
        exampleBytes = await readFile(examplePdfPath);
        return exampleBytes;
      } catch {
        // Fall through to the official SEC source.
      }
    }
    exampleBytes = await fetchExamplePdf();
    return exampleBytes;
  }

  function setup(server) {
    installMiddleware(server, config, getExampleBytes, pageCache);
  }

  return {
    name: "qwen-sec-deal-review-api",
    configureServer: setup,
    configurePreviewServer: setup
  };
}
