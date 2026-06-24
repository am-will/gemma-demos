import express from "express";
import cors from "cors";
import multer from "multer";
import { nanoid } from "nanoid";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { prepareImages, makeBatches } from "./imagePrep.js";
import { runCerebrasAgent } from "./providers/cerebras.js";
import { runGeminiAgent } from "./providers/gemini.js";
import { runOpenRouterAgent } from "./providers/openrouter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, "..", ".env"), override: true });

const port = Number(process.env.PORT || 8791);
const workDir = path.join(rootDir, "work", "runs");
const outputDir = path.join(rootDir, "outputs", "runs");
const uploadDir = path.join(rootDir, "work", "uploads");
const distDir = path.join(rootDir, "dist");
const runs = new Map();

await Promise.all([
  mkdir(workDir, { recursive: true }),
  mkdir(outputDir, { recursive: true }),
  mkdir(uploadDir, { recursive: true })
]);

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_FILE_BYTES || 18 * 1024 * 1024),
    files: Number(process.env.MAX_UPLOAD_FILES || 10000)
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) cb(null, true);
    else cb(null, false);
  }
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/outputs", express.static(path.join(rootDir, "outputs")));
app.use(express.static(distDir));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "visual-search-triage",
    port,
    providers: {
      gemini: {
        label: "Gemini Responses API",
        hasKey: Boolean(process.env.GEMINI_API_KEY),
        model: process.env.GEMINI_MODEL || "gemini-3.5-flash"
      },
      openrouter: {
        label: "OpenRouter API",
        hasKey: Boolean(process.env.OPENROUTER_API_KEY),
        model: process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free"
      },
      cerebras: {
        label: "Cerebras API",
        hasKey: Boolean(process.env.CEREBRAS_API_KEY),
        model: process.env.CEREBRAS_MODEL || "gemma-4-31b-trial"
      }
    },
    batching: {
      maxBatchImages: Number(process.env.MAX_BATCH_IMAGES || 4),
      maxBatchBytes: Number(process.env.MAX_BATCH_BYTES || 3 * 1024 * 1024),
      imageMaxEdge: Number(process.env.IMAGE_MAX_EDGE || 512)
    }
  });
});

app.post("/api/runs", upload.array("images"), async (req, res) => {
  const description = String(req.body.description || "").trim();
  const leftProvider = req.body.leftProvider === "openrouter" ? "openrouter" : "gemini";
  const files = req.files || [];

  if (!description) {
    await cleanupFiles(files);
    res.status(400).json({ error: "Enter an image search description." });
    return;
  }
  if (!files.length) {
    res.status(400).json({ error: "Select a folder containing image files." });
    return;
  }

  const runId = nanoid(10);
  const runDir = path.join(workDir, runId);
  const runOutputDir = path.join(outputDir, runId);
  await Promise.all([mkdir(runDir, { recursive: true }), mkdir(runOutputDir, { recursive: true })]);

  const run = {
    id: runId,
    description,
    leftProvider,
    files,
    runDir,
    runOutputDir,
    status: "created",
    createdAt: new Date().toISOString(),
    started: false,
    events: [],
    subscribers: new Set(),
    manifest: null
  };
  runs.set(runId, run);

  res.status(202).json({ runId, imageCount: files.length });
});

app.get("/api/runs/:runId/events", async (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run) {
    res.status(404).json({ error: "Unknown run" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write("\n");

  const subscriber = (event) => writeSse(res, event);
  run.subscribers.add(subscriber);
  for (const event of run.events) subscriber(event);

  req.on("close", () => {
    run.subscribers.delete(subscriber);
  });

  if (!run.started) {
    run.started = true;
    processRun(run).catch((error) => {
      emit(run, "error", { provider: "system", message: error.message || String(error) });
      emit(run, "run_done", { status: "failed" });
    });
  }
});

app.get("/api/runs/:runId/manifest", (req, res) => {
  const manifestPath = path.join(outputDir, req.params.runId, "manifest.json");
  res.setHeader("Content-Type", "application/json");
  createReadStream(manifestPath).on("error", () => res.status(404).json({ error: "Manifest not found" })).pipe(res);
});

app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Image Search demo listening on http://127.0.0.1:${port}`);
});

async function processRun(run) {
  run.status = "running";
  emit(run, "trace", {
    provider: "system",
    phase: "start",
    message: `Starting side-by-side image search with ${run.files.length} images`
  });

  const images = await prepareImages({
    files: run.files,
    runDir: run.runOutputDir,
    emit: (type, payload) => emit(run, type, payload)
  });
  const batches = makeBatches(images);
  emit(run, "metric", {
    provider: "system",
    images: images.length,
    batches: batches.length,
    preparedBytes: images.reduce((total, image) => total + image.preparedBytes, 0)
  });
  emit(run, "trace", {
    provider: "system",
    phase: "batch",
    message: `All ${images.length} images will be processed across ${batches.length} batch${batches.length === 1 ? "" : "es"}`
  });

  const providerEmit = (type, payload) => emit(run, type, payload);
  const runLeftProvider = run.leftProvider === "openrouter" ? runOpenRouterAgent : runGeminiAgent;
  const [leftProvider, cerebras] = await Promise.allSettled([
    runLeftProvider({ description: run.description, batches, emit: providerEmit }),
    runCerebrasAgent({ description: run.description, batches, emit: providerEmit })
  ]);

  const results = {
    gemini: settleResult("gemini", leftProvider, run),
    cerebras: settleResult("cerebras", cerebras, run)
  };

  const manifest = {
    runId: run.id,
    createdAt: run.createdAt,
    completedAt: new Date().toISOString(),
    description: run.description,
    leftProvider: run.leftProvider,
    images: images.map(({ base64, dataUrl, ...image }) => image),
    batchCount: batches.length,
    providers: {
      gemini: {
        model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
        hasKey: Boolean(process.env.GEMINI_API_KEY)
      },
      openrouter: {
        model: process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free",
        hasKey: Boolean(process.env.OPENROUTER_API_KEY)
      },
      cerebras: {
        model: process.env.CEREBRAS_MODEL || "gemma-4-31b-trial",
        hasKey: Boolean(process.env.CEREBRAS_API_KEY)
      }
    },
    results
  };

  await writeFile(path.join(run.runOutputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  await cleanupFiles(run.files);
  run.manifest = manifest;
  run.status = "complete";
  emit(run, "run_done", {
    status: "complete",
    manifestUrl: `/api/runs/${run.id}/manifest`,
    results
  });
}

function settleResult(provider, settled, run) {
  if (settled.status === "fulfilled") return settled.value;
  const message = settled.reason?.message || String(settled.reason);
  emit(run, "error", { provider, message });
  emit(run, "provider_done", { provider, status: "failed", error: message });
  return { provider, status: "failed", error: message };
}

function emit(run, type, payload) {
  const event = {
    type,
    at: new Date().toISOString(),
    ...payload
  };
  run.events.push(event);
  for (const subscriber of run.subscribers) subscriber(event);
}

function writeSse(res, event) {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function cleanupFiles(files) {
  await Promise.all((files || []).map((file) => rm(file.path, { force: true }).catch(() => {})));
}
