import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 12;

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "classification",
    "transaction_scope",
    "sold",
    "retained",
    "financial_impact",
    "visual_evidence",
    "why_it_matters",
    "source_pages",
    "confidence"
  ],
  properties: {
    headline: { type: "string" },
    classification: { type: "string" },
    transaction_scope: { type: "string" },
    sold: { type: "string" },
    retained: { type: "string" },
    financial_impact: { type: "string" },
    visual_evidence: { type: "string" },
    why_it_matters: { type: "string" },
    source_pages: {
      type: "array",
      minItems: 1,
      items: { type: "integer" }
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] }
  }
};

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

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_PDF_BYTES * 1.5) throw new Error("PDF request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function decodePdf(body, exampleBytes) {
  if (!body.fileData) return { bytes: exampleBytes, filename: "project-fusion.pdf" };
  const match = String(body.fileData).match(/^data:application\/pdf;base64,(.+)$/s);
  if (!match) throw new Error("Only base64-encoded PDF files are supported.");
  const bytes = Buffer.from(match[1], "base64");
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("The uploaded file is not a valid PDF.");
  if (bytes.length > MAX_PDF_BYTES) throw new Error("PDF must be 15 MB or smaller.");
  return { bytes, filename: basename(body.filename || "uploaded-filing.pdf") };
}

function parsePageCount(pdfInfo) {
  const match = pdfInfo.match(/^Pages:\s+(\d+)$/m);
  if (!match) throw new Error("Could not determine the PDF page count.");
  return Number(match[1]);
}

function pageTextSections(text) {
  return text
    .split("\f")
    .map((page, index) => `[PDF PAGE ${index + 1} NATIVE TEXT]\n${page.trim()}`)
    .filter((page) => !page.endsWith("]\n"))
    .join("\n\n");
}

async function preparePdf(bytes) {
  const workDir = await mkdtemp(join(tmpdir(), "qwen-sec-review-"));
  const pdfPath = join(workDir, "source.pdf");
  const imagePrefix = join(workDir, "page");
  await writeFile(pdfPath, bytes);

  const [{ stdout: info }, { stdout: text }] = await Promise.all([
    runFile("pdfinfo", [pdfPath], { maxBuffer: 2 * 1024 * 1024 }),
    runFile("pdftotext", ["-layout", pdfPath, "-"], { maxBuffer: 12 * 1024 * 1024 })
  ]);

  const pageCount = parsePageCount(info);
  if (pageCount > MAX_PAGES) {
    await rm(workDir, { recursive: true, force: true });
    throw new Error(`This demo accepts up to ${MAX_PAGES} pages. The PDF has ${pageCount}.`);
  }

  await runFile("pdftoppm", [
    "-jpeg",
    "-r",
    "120",
    "-jpegopt",
    "quality=82,optimize=y",
    pdfPath,
    imagePrefix
  ], { maxBuffer: 2 * 1024 * 1024 });

  const imageNames = (await readdir(workDir))
    .filter((name) => /^page-\d+\.jpg$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const images = await Promise.all(imageNames.map(async (name) => ({
    name,
    data: (await readFile(join(workDir, name))).toString("base64")
  })));

  return {
    workDir,
    pageCount,
    nativeText: pageTextSections(text),
    images
  };
}

function modelInput(prepared) {
  const prompt = [
    "You are reviewing an SEC-filed investor presentation.",
    "Analyze the native PDF text and every rendered page image together.",
    "The task is to determine exactly what asset or right was sold, what the issuer retained, the financial impact, and why the distinction matters to an investor.",
    "Use visual layout, map boundaries, arrows, labels, tables, and footnotes when they clarify the transaction scope.",
    "Do not infer a broader asset sale than the document evidence supports.",
    "Cite PDF page numbers. If visual and native-text evidence conflict, state the conflict rather than guessing.",
    "Use only claims supported by the document. Do not label an asset non-core, non-income-producing, high-growth, or strategically important unless the document says so.",
    "Do not add assumptions about management strategy, asset quality, or capital requirements.",
    "Keep every field concise and factual.",
    prepared.nativeText
  ].join("\n\n");

  const content = [{ type: "input_text", text: prompt }];
  prepared.images.forEach((image, index) => {
    content.push({ type: "input_text", text: `PDF PAGE ${index + 1} RENDERED IMAGE` });
    content.push({
      type: "input_image",
      detail: "high",
      image_url: `data:image/jpeg;base64,${image.data}`
    });
  });
  return [{ role: "user", content }];
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

async function callQwen({ baseUrl, apiKey, model, prepared }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: modelInput(prepared),
      reasoning: { effort: "none" },
      temperature: 0.2,
      max_output_tokens: 900,
      text: {
        format: {
          type: "json_schema",
          name: "sec_visual_review",
          strict: true,
          schema: RESULT_SCHEMA
        }
      }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || `Qwen request failed with HTTP ${response.status}.`);
  return {
    result: parseModelJson(extractOutputText(payload)),
    usage: payload.usage || null,
    responseId: payload.id || null
  };
}

function installMiddleware(server, config, exampleBytes, pageCache) {
  server.middlewares.use("/api/status", async (_request, response) => {
    try {
      const modelResponse = await fetch(`${config.baseUrl.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(3000)
      });
      sendJson(response, 200, {
        connected: modelResponse.ok,
        model: config.model,
        provider: "openai-compatible",
        endpoint: "/responses"
      });
    } catch {
      sendJson(response, 200, {
        connected: false,
        model: config.model,
        provider: "openai-compatible",
        endpoint: "/responses"
      });
    }
  });

  server.middlewares.use("/api/example/page/", async (request, response) => {
    const page = Number(new URL(request.url, "http://local").pathname.split("/").pop());
    if (!Number.isInteger(page) || page < 1 || page > 6) {
      sendJson(response, 404, { error: "Page not found." });
      return;
    }
    try {
      if (!pageCache.has(page)) {
        const workDir = await mkdtemp(join(tmpdir(), "qwen-sec-preview-"));
        const pdfPath = join(workDir, "source.pdf");
        const outputPath = join(workDir, "preview");
        await writeFile(pdfPath, exampleBytes);
        await runFile("pdftoppm", ["-f", String(page), "-singlefile", "-jpeg", "-r", "110", "-jpegopt", "quality=84,optimize=y", pdfPath, outputPath]);
        pageCache.set(page, await readFile(`${outputPath}.jpg`));
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
      const source = decodePdf(body, exampleBytes);
      streamEvent(response, "progress", { stage: "extract", label: "Reading native PDF text", filename: source.filename });
      prepared = await preparePdf(source.bytes);
      streamEvent(response, "progress", { stage: "render", label: `Rendered ${prepared.pageCount} pages`, pageCount: prepared.pageCount });
      streamEvent(response, "progress", { stage: "vision", label: "Sending text and page images to Qwen", visualInputs: prepared.images.length });
      const startedAt = performance.now();
      const output = await callQwen({ ...config, prepared });
      const elapsedMs = Math.round(performance.now() - startedAt);
      streamEvent(response, "result", {
        ...output,
        elapsedMs,
        pageCount: prepared.pageCount,
        visualInputs: prepared.images.length,
        filename: source.filename
      });
    } catch (error) {
      streamEvent(response, "error", { message: error.message || "Document analysis failed." });
    } finally {
      if (prepared?.workDir) await rm(prepared.workDir, { recursive: true, force: true });
      response.end();
    }
  });
}

export function createQwenDocumentPlugin({ baseUrl, apiKey, model, examplePdfPath }) {
  const config = { baseUrl, apiKey, model };
  const pageCache = new Map();
  let exampleBytes;
  async function setup(server) {
    exampleBytes ||= await readFile(examplePdfPath);
    installMiddleware(server, config, exampleBytes, pageCache);
  }
  return {
    name: "qwen-sec-document-api",
    configureServer: setup,
    configurePreviewServer: setup
  };
}
