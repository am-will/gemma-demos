import express from "express";
import cors from "cors";
import multer from "multer";
import { nanoid } from "nanoid";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import sharp from "sharp";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, "..", ".env") });
const runtimeDir = path.join(rootDir, "work", "runtime");
const uploadsDir = path.join(runtimeDir, "uploads");
const tmpDir = path.join(runtimeDir, "tmp");
const outputsDir = path.join(rootDir, "outputs", "jobs");
const distDir = path.join(rootDir, "dist");
const cerebrasModel = process.env.CEREBRAS_MODEL || "gemma-4-31b-trial";
const openRouterModel = process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free";
const port = Number(process.env.PORT || 8787);
const extractionMaxWidth = Number(process.env.FRAME_EXTRACTION_MAX_WIDTH || 1920);
const extractionJpegQuality = Number(process.env.FRAME_EXTRACTION_JPEG_QUALITY || 92);
const ffmpegHwaccel = process.env.FFMPEG_HWACCEL || (process.platform === "darwin" ? "videotoolbox" : "auto");
const extractionMode = process.env.FRAME_EXTRACTION_MODE || "sparse-sharp";
const extractionSeekWorkers = clampInteger(process.env.FRAME_EXTRACTION_SEEK_WORKERS, 1, 8, 4);
const extractionBlurThreshold = Number(process.env.FRAME_EXTRACTION_BLUR_THRESHOLD || 85);
const frameBatchSize = clampInteger(process.env.FRAME_INSPECTION_BATCH_SIZE || process.env.GPU_BATCH_SIZE, 1, 8, 3);

await Promise.all([mkdir(uploadsDir, { recursive: true }), mkdir(tmpDir, { recursive: true }), mkdir(outputsDir, { recursive: true })]);

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 1024 * 1024 * 500 }
});

const jobs = new Map();
const providers = {
  gpu: {
    id: "gpu",
    label: "GPU",
    actualProvider: "openrouter",
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiHostLabel: "https://gpu.endpoint/v1/chat/completions",
    model: openRouterModel,
    publicModel: sanitizePublicModel(openRouterModel),
    keyEnv: "OPENROUTER_API_KEY",
    hasKey: () => Boolean(process.env.OPENROUTER_API_KEY)
  },
  cerebras: {
    id: "cerebras",
    label: "Cerebras",
    actualProvider: "cerebras",
    apiUrl: "https://api.cerebras.ai/v1/chat/completions",
    apiHostLabel: "https://api.cerebras.ai/v1/chat/completions",
    model: cerebrasModel,
    publicModel: sanitizePublicModel(cerebrasModel),
    keyEnv: "CEREBRAS_API_KEY",
    hasKey: () => Boolean(process.env.CEREBRAS_API_KEY)
  }
};
const providerOrder = ["cerebras", "gpu"];
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/outputs", express.static(path.join(rootDir, "outputs")));
app.use(express.static(distDir));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "car-damage",
    providers: Object.fromEntries(providerOrder.map((id) => {
      const provider = providers[id];
      return [id, { label: provider.label, model: provider.publicModel, hasKey: provider.hasKey() }];
    }))
  });
});

app.post("/api/analyze", upload.single("video"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Upload a video file in the field named video." });
    return;
  }

  const jobId = nanoid(10);
  const sampleFps = clampNumber(req.body.sampleFps, 0.2, 3, 0.5);
  const maxFrames = clampNumber(req.body.maxFrames, 1, 80, 20);
  const confidenceFloor = clampNumber(req.body.confidenceFloor, 0, 1, 0.35);
  const frameConcurrency = clampInteger(req.body.frameConcurrency, 1, 8, 4);
  const tileConcurrency = clampInteger(req.body.tileConcurrency, 1, 6, 3);
  const jobTmp = path.join(tmpDir, jobId);
  const jobOut = path.join(outputsDir, jobId);
  const framesDir = path.join(jobTmp, "frames");
  const job = {
    id: jobId,
    status: "queued",
    progress: 0,
    message: "Queued video inspection",
    createdAt: new Date().toISOString(),
    settings: {
      sampleFps,
      maxFrames,
      confidenceFloor,
      frameConcurrency,
      tileConcurrency,
      frameBatchSize,
      models: Object.fromEntries(providerOrder.map((id) => [id, providers[id].publicModel])),
      extractionMaxWidth,
      extractionJpegQuality,
      extractionMode
    },
    pipeline: buildPipeline(),
    providerRuns: makeProviderRuns(),
    events: [],
    subscribers: new Set(),
    inspectionStarted: false,
    internal: {
      videoPath: req.file.path,
      originalName: req.file.originalname,
      jobTmp,
      jobOut,
      framesDir,
      frameFiles: [],
      extraction: null
    },
    result: null,
    error: null
  };
  await mkdir(jobOut, { recursive: true });
  await persistJobState(job);
  jobs.set(jobId, job);
  res.status(202).json({ jobId });

  processExtractionJob(job, req.file.path, req.file.originalname).catch((error) => {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.message = "Frame extraction failed";
    failActivePipelineStep(job, job.error);
  });
});

app.post("/api/jobs/:jobId/inspect", async (req, res) => {
  const job = await getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Unknown job" });
    return;
  }
  if (job.status !== "extracted") {
    res.status(409).json({ error: `Job is ${job.status}; it must be extracted before Gemma inspection can start.` });
    return;
  }
  if (job.inspectionStarted) {
    res.status(202).json({ jobId: job.id });
    return;
  }
  job.inspectionStarted = true;
  res.status(202).json({ jobId: job.id });
  continueInspectionJob(job).catch((error) => {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.message = "Analysis failed";
    failActivePipelineStep(job, job.error);
  });
});

app.get("/api/jobs/:jobId/events", async (req, res) => {
  const job = await getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Unknown job" });
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
  job.subscribers.add(subscriber);
  for (const event of job.events) subscriber(event);

  req.on("close", () => {
    job.subscribers.delete(subscriber);
  });
});

app.get("/api/jobs/:jobId", async (req, res) => {
  const job = await getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Unknown job" });
    return;
  }
  const { internal: _internal, subscribers: _subscribers, events: _events, ...publicJob } = job;
  res.json(publicJob);
});

app.get("/api/jobs/:jobId/download", (req, res) => {
  const manifestPath = path.join(outputsDir, req.params.jobId, "manifest.json");
  res.setHeader("Content-Type", "application/json");
  createReadStream(manifestPath).on("error", () => res.status(404).json({ error: "Manifest not found" })).pipe(res);
});

app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return;
  const isUploadError = error instanceof multer.MulterError;
  const status = isUploadError && error.code === "LIMIT_FILE_SIZE" ? 413 : isUploadError ? 400 : 500;
  const message = status === 413 ? "Upload is too large. Use a video under 500 MB." : error?.message || "Server error";
  res.status(status).json({ error: cleanText(message) });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Damage Scout API listening on http://127.0.0.1:${port}`);
});

async function processExtractionJob(job, videoPath, originalName) {
  const jobTmp = job.internal?.jobTmp || path.join(tmpDir, job.id);
  const jobOut = job.internal?.jobOut || path.join(outputsDir, job.id);
  const framesDir = job.internal?.framesDir || path.join(jobTmp, "frames");
  job.internal = {
    ...(job.internal || {}),
    videoPath,
    originalName,
    jobTmp,
    jobOut,
    framesDir,
    frameFiles: job.internal?.frameFiles || [],
    extraction: job.internal?.extraction || null
  };
  await Promise.all([mkdir(framesDir, { recursive: true }), mkdir(jobOut, { recursive: true })]);

  job.status = "processing";
  job.pipeline = buildPipeline();
  setPipelineStep(job, "upload", "complete", `Received ${originalName}`, { progress: 1 });
  setPipelineStep(job, "extract", "active", "Starting ffmpeg frame extraction", { progress: 0 });
  job.message = "Extracting representative frames";
  job.progress = 5;
  await persistJobState(job);

  const extractionStartedAt = Date.now();
  const extraction = await extractFrames(videoPath, framesDir, job.settings.sampleFps, job.settings.maxFrames, (event) => {
    const progress = Math.max(0, Math.min(1, event.progress || 0));
    setPipelineStep(job, "extract", "active", event.detail || "Extracting frames", {
      progress,
      elapsedMs: Date.now() - extractionStartedAt
    });
    job.progress = Math.round(5 + progress * 13);
    job.message = event.detail || "Extracting representative frames";
  });
  let frameFiles = (await readdir(framesDir))
    .filter((name) => name.endsWith(".jpg"))
    .sort()
    .slice(0, job.settings.maxFrames);

  if (frameFiles.length === 0) {
    throw new Error("ffmpeg did not extract any frames from the video.");
  }

  setPipelineStep(job, "extract", "complete", `Extracted ${frameFiles.length} frame${frameFiles.length === 1 ? "" : "s"} at ${extraction.effectiveSampleFps} FPS`, {
    progress: 1,
    elapsedMs: Date.now() - extractionStartedAt
  });

  job.status = "extracted";
  job.progress = 18;
  job.message = `Extracted ${frameFiles.length} frame${frameFiles.length === 1 ? "" : "s"}. Ready for side-by-side inspection.`;
  job.internal = { videoPath, originalName, jobTmp, jobOut, framesDir, frameFiles, extraction };
  await persistJobState(job);
}

async function continueInspectionJob(job) {
  const { videoPath, originalName, jobTmp, jobOut, framesDir, frameFiles, extraction } = job.internal || {};
  if (!framesDir || !jobOut || !Array.isArray(frameFiles) || !extraction) {
    throw new Error("Extracted frame data is missing. Upload the video again.");
  }

  job.status = "inspecting";
  job.progress = 20;
  job.message = `Running ${providerOrder.length} damage agents side by side`;
  await persistJobState(job);
  emitJobEvent(job, "trace", { provider: "system", phase: "start", message: `Starting comparison with ${frameFiles.length} extracted frame${frameFiles.length === 1 ? "" : "s"}` });

  const settledRuns = await Promise.allSettled(providerOrder.map((providerId) => runDamageProvider({
    job,
    provider: providers[providerId],
    originalName,
    jobOut,
    framesDir,
    frameFiles,
    extraction
  })));
  const providerResults = {};
  settledRuns.forEach((settled, index) => {
    const provider = providers[providerOrder[index]];
    if (settled.status === "fulfilled") {
      providerResults[provider.id] = settled.value;
      return;
    }
    const message = settled.reason?.message || String(settled.reason);
    providerResults[provider.id] = {
      provider: provider.id,
      label: provider.label,
      model: provider.publicModel,
      status: "failed",
      error: sanitizeTraceText(message),
      totalLatencyMs: null,
      detections: [],
      report: null,
      rawFrameFindings: []
    };
    job.providerRuns[provider.id] = {
      ...job.providerRuns[provider.id],
      status: "failed",
      error: sanitizeTraceText(message)
    };
    emitJobEvent(job, "error", { provider: provider.id, message });
    emitJobEvent(job, "provider_done", providerResults[provider.id]);
  });
  await persistJobState(job);

  const manifest = {
    jobId: job.id,
    originalName,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    settings: job.settings,
    extraction,
    sampledFrames: frameFiles.length,
    providers: providerResults
  };
  await writeFile(path.join(jobOut, "manifest.json"), JSON.stringify(manifest, null, 2));
  await rm(path.join(jobOut, "job-state.json"), { force: true });
  await rm(jobTmp, { recursive: true, force: true });
  await rm(videoPath, { force: true });

  job.status = "complete";
  job.progress = 100;
  const completedRuns = Object.values(providerResults).filter((result) => result.status === "complete");
  const totalDetections = completedRuns.reduce((total, result) => total + (result.detections?.length || 0), 0);
  job.message = completedRuns.length
    ? `Comparison complete with ${totalDetections} total damage candidate${totalDetections === 1 ? "" : "s"}`
    : "Comparison failed";
  job.result = { ...manifest, manifestUrl: `/outputs/jobs/${job.id}/manifest.json` };
  delete job.internal;
  emitJobEvent(job, "run_done", { status: completedRuns.length ? "complete" : "failed", manifestUrl: job.result.manifestUrl, providers: providerResults });
}

async function getJob(jobId) {
  const existing = jobs.get(jobId);
  if (existing) return existing;
  const hydrated = await hydrateJobFromDisk(jobId);
  if (hydrated) {
    jobs.set(jobId, hydrated);
    maybeResumeExtractionJob(hydrated);
  }
  return hydrated;
}

async function hydrateJobFromDisk(jobId) {
  const jobOut = path.join(outputsDir, jobId);
  const manifest = await readJsonIfExists(path.join(jobOut, "manifest.json"));
  if (manifest) {
    const completedRuns = Object.values(manifest.providers || {}).filter((result) => result.status === "complete");
    const totalDetections = completedRuns.reduce((total, result) => total + (result.detections?.length || 0), 0);
    return {
      id: jobId,
      status: completedRuns.length ? "complete" : "failed",
      progress: 100,
      message: completedRuns.length
        ? `Comparison complete with ${totalDetections} total damage candidate${totalDetections === 1 ? "" : "s"}`
        : "Comparison failed",
      createdAt: manifest.createdAt,
      settings: manifest.settings,
      pipeline: buildHydratedPipeline(completedRuns.length ? "complete" : "failed"),
      providerRuns: buildHydratedProviderRuns(manifest.providers || {}),
      events: [],
      subscribers: new Set(),
      inspectionStarted: true,
      result: { ...manifest, manifestUrl: `/outputs/jobs/${jobId}/manifest.json` },
      error: null
    };
  }

  const state = await readJsonIfExists(path.join(jobOut, "job-state.json"));
  if (!state) return null;
  const status = state.status === "inspecting" ? "extracted" : state.status;
  return {
    ...state,
    status,
    inspectionStarted: false,
    message: status === "extracted" ? "Frames restored. Ready for side-by-side inspection." : state.message,
    events: [],
    subscribers: new Set(),
    partialProviderResults: state.partialProviderResults || null,
    result: state.partialProviderResults ? { providers: state.partialProviderResults } : null,
    error: state.error || null
  };
}

async function maybeResumeExtractionJob(job) {
  if (!["queued", "processing"].includes(job.status) || job.extractionResumeStarted) return;
  const { videoPath, originalName } = job.internal || {};
  if (!videoPath || !originalName) {
    markExtractionInterrupted(job);
    return;
  }
  try {
    await access(videoPath);
  } catch {
    markExtractionInterrupted(job);
    return;
  }
  job.extractionResumeStarted = true;
  processExtractionJob(job, videoPath, originalName).catch((error) => {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.message = "Frame extraction failed";
    failActivePipelineStep(job, job.error);
    persistJobState(job).catch(() => {});
  });
}

function markExtractionInterrupted(job) {
  job.status = "failed";
  job.progress = 0;
  job.message = "Upload was interrupted. Upload the video again.";
  job.error = "Upload was interrupted. Upload the video again.";
  failActivePipelineStep(job, job.error);
  persistJobState(job).catch(() => {});
}

async function persistJobState(job) {
  if (!job?.internal?.jobOut) return;
  const state = {
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    createdAt: job.createdAt,
    settings: job.settings,
    pipeline: job.pipeline,
    providerRuns: job.providerRuns,
    partialProviderResults: job.partialProviderResults || null,
    inspectionStarted: false,
    internal: job.internal,
    error: job.error || null
  };
  await writeFile(path.join(job.internal.jobOut, "job-state.json"), JSON.stringify(state, null, 2));
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function buildHydratedPipeline(status) {
  return buildPipeline().map((step) => ({
    ...step,
    status,
    progress: status === "complete" ? 1 : step.progress,
    detail: status === "complete" ? "Restored from manifest" : "Restored failed job"
  }));
}

function buildHydratedProviderRuns(providerResults) {
  return Object.fromEntries(providerOrder.map((id) => {
    const result = providerResults[id];
    const provider = providers[id];
    return [id, {
      provider: id,
      label: provider.label,
      model: result?.model || provider.publicModel,
      status: result?.status || "failed",
      message: result?.status === "complete"
        ? `${result.detections?.length || 0} evidence image${(result.detections?.length || 0) === 1 ? "" : "s"} ready`
        : result?.error || "No result restored",
      pipeline: buildProviderPipeline().map((step) => ({ ...step, status: result?.status === "complete" ? "complete" : "failed", progress: result?.status === "complete" ? 1 : step.progress })),
      totalLatencyMs: result?.totalLatencyMs || null,
      error: result?.error || null
    }];
  }));
}

async function runDamageProvider({ job, provider, originalName, jobOut, framesDir, frameFiles, extraction }) {
  const startedAt = performance.now();
  const providerStartedAt = Date.now();
  job.providerRuns[provider.id] = {
    ...job.providerRuns[provider.id],
    status: "running",
    startedAt: new Date().toISOString(),
    message: "Agent starting",
    pipeline: buildProviderPipeline()
  };

  emitJobEvent(job, "trace", {
    provider: provider.id,
    phase: "boot",
    message: `Agent online with model ${provider.publicModel}`
  });
  if (!provider.hasKey()) throw new Error(`Missing ${provider.keyEnv}.`);

  await preflightProvider(provider, path.join(framesDir, frameFiles[0]), (type, payload) => emitJobEvent(job, type, payload));

  setProviderStep(job, provider.id, "inspect", "active", `0 of ${frameFiles.length} frames inspected`, { progress: 0 });
  emitJobEvent(job, "trace", {
    provider: provider.id,
    phase: "command",
    message: renderDamageCurl(provider, frameFiles.length)
  });
  emitJobEvent(job, "trace", {
    provider: provider.id,
    phase: "dispatch",
    message: `POST ${provider.apiHostLabel} with ${frameFiles.length} sampled frame${frameFiles.length === 1 ? "" : "s"}`
  });

  const onInspectionProgress = (completed, total) => {
    const progress = completed / total;
    setProviderStep(job, provider.id, "inspect", "active", `${completed} of ${total} frames inspected`, {
      progress,
      elapsedMs: Date.now() - providerStartedAt
    });
    updateComparisonProgress(job);
    emitJobEvent(job, "partial_result", {
      provider: provider.id,
      completed,
      total
    });
  };
  const frameFindings = await inspectFramesWithBatches(
    provider,
    frameFiles,
    framesDir,
    job.settings.tileConcurrency,
    onInspectionProgress,
    (type, payload) => emitJobEvent(job, type, payload)
  );

  setProviderStep(job, provider.id, "inspect", "complete", `Inspected ${frameFiles.length} sampled frame${frameFiles.length === 1 ? "" : "s"}`, {
    progress: 1,
    elapsedMs: Date.now() - providerStartedAt
  });
  emitJobEvent(job, "trace", {
    provider: provider.id,
    phase: "response",
    message: `${frameFiles.length} frame${frameFiles.length === 1 ? "" : "s"} inspected in ${formatMs(Date.now() - providerStartedAt)}`
  });

  const dedupeStartedAt = Date.now();
  setProviderStep(job, provider.id, "dedupe", "active", "Merging repeated sightings", { progress: 0 });
  const detections = dedupeFindings(frameFindings, job.settings.confidenceFloor);
  setProviderStep(job, provider.id, "dedupe", "complete", `${detections.length} unique damage candidate${detections.length === 1 ? "" : "s"}`, {
    progress: 1,
    elapsedMs: Date.now() - dedupeStartedAt
  });

  const annotationStartedAt = Date.now();
  setProviderStep(job, provider.id, "annotate", "active", "Drawing evidence boxes", { progress: 0 });
  const annotated = [];
  const providerDir = path.join(jobOut, provider.id);
  await mkdir(providerDir, { recursive: true });
  for (let i = 0; i < detections.length; i += 1) {
    const detection = detections[i];
    const frame = frameFindings.find((item) => item.frameNumber === detection.frameNumber);
    if (!frame) continue;
    const imageNumber = annotated.length + 1;
    const outputName = `damage-${String(i + 1).padStart(2, "0")}-${slugify(detection.label)}.jpg`;
    const outputPath = path.join(providerDir, outputName);
    await annotateFrame(frame.framePath, outputPath, detection);
    annotated.push({
      ...detection,
      imageNumber,
      imageLabel: `Image ${imageNumber}`,
      imageFilename: outputName,
      imageUrl: `/outputs/jobs/${job.id}/${provider.id}/${outputName}`
    });
    setProviderStep(job, provider.id, "annotate", "active", `${annotated.length} of ${detections.length} evidence images drawn`, {
      progress: detections.length ? annotated.length / detections.length : 1,
      elapsedMs: Date.now() - annotationStartedAt
    });
  }
  setProviderStep(job, provider.id, "annotate", "complete", `${annotated.length} evidence image${annotated.length === 1 ? "" : "s"} ready`, {
    progress: 1,
    elapsedMs: Date.now() - annotationStartedAt
  });

  const reportStartedAt = Date.now();
  setProviderStep(job, provider.id, "report", "active", "Writing report artifacts", { progress: 0 });
  const report = buildDamageReport({
    jobId: job.id,
    originalName,
    model: provider.publicModel,
    provider: provider.label,
    settings: job.settings,
    extraction,
    sampledFrames: frameFiles.length,
    detections: annotated
  });
  const reportUrl = `/outputs/jobs/${job.id}/${provider.id}/damage-report.json`;
  const reportMarkdownUrl = `/outputs/jobs/${job.id}/${provider.id}/damage-report.md`;
  await writeFile(path.join(providerDir, "damage-report.json"), JSON.stringify(report, null, 2));
  await writeFile(path.join(providerDir, "damage-report.md"), renderDamageReportMarkdown(report));
  setProviderStep(job, provider.id, "report", "complete", "Report JSON and Markdown written", {
    progress: 1,
    elapsedMs: Date.now() - reportStartedAt
  });

  const totalLatencyMs = Math.round(performance.now() - startedAt);
  const result = {
    provider: provider.id,
    label: provider.label,
    model: provider.publicModel,
    status: "complete",
    totalLatencyMs,
    detections: annotated,
    report,
    reportUrl,
    reportMarkdownUrl,
    rawFrameFindings: frameFindings.map(({ frameNumber, filename, findings }) => ({ frameNumber, filename, findings }))
  };
  job.providerRuns[provider.id] = {
    ...job.providerRuns[provider.id],
    status: "complete",
    completedAt: new Date().toISOString(),
    totalLatencyMs,
    message: annotated.length ? `${annotated.length} evidence image${annotated.length === 1 ? "" : "s"} ready` : "No visible damage candidates"
  };
  job.partialProviderResults = {
    ...(job.partialProviderResults || {}),
    [provider.id]: result
  };
  await persistJobState(job);
  emitJobEvent(job, "provider_done", result);
  return result;
}

function buildDamageReport({ jobId, originalName, model, provider, settings, extraction, sampledFrames, detections }) {
  const items = detections.map((detection) => {
    const confidencePercent = Math.round(detection.confidence * 100);
    const vehiclePart = cleanVehiclePart(detection.location);
    const damageType = formatDamageType(detection.damageType);
    return {
      id: `${jobId}-${String(detection.imageNumber).padStart(2, "0")}`,
      imageNumber: detection.imageNumber,
      imageLabel: detection.imageLabel,
      imageFilename: detection.imageFilename,
      imageUrl: detection.imageUrl,
      frameNumber: detection.frameNumber,
      sourceFrame: detection.sourceFrame,
      damageLabel: detection.label,
      damageType: detection.damageType,
      damageTypeLabel: damageType,
      vehiclePart,
      location: detection.location,
      severity: detection.severity,
      confidence: detection.confidence,
      confidencePercent,
      evidence: detection.evidence,
      bbox: detection.bbox,
      bboxApproximate: detection.bboxApproximate,
      sentence: `${detection.imageLabel} shows ${articleFor(damageType)} ${damageType.toLowerCase()} on the ${vehiclePart}.`
    };
  });

  return {
    reportTitle: "Rental Car Damage Report",
    generatedAt: new Date().toISOString(),
    jobId,
    sourceVideo: originalName,
    provider,
    model,
    settings,
    extraction,
    sampledFrames,
    totalDamageItems: items.length,
    imagesWithDamage: new Set(items.map((item) => item.imageNumber)).size,
    summary: summarizeDamageItems(items),
    items
  };
}

function summarizeDamageItems(items) {
  const byType = countBy(items, (item) => item.damageTypeLabel);
  const bySeverity = countBy(items, (item) => item.severity);
  const byVehiclePart = countBy(items, (item) => item.vehiclePart);
  const headline = `Found ${items.length} unique damage candidate${items.length === 1 ? "" : "s"}`;
  return { headline, byType, bySeverity, byVehiclePart };
}

function renderDamageReportMarkdown(report) {
  const lines = [
    `# ${report.reportTitle}`,
    "",
    `Source video: ${report.sourceVideo || "uploaded video"}`,
    `Generated: ${report.generatedAt}`,
    `Model: ${report.model}`,
    `Sampled frames: ${report.sampledFrames}`,
    `Damage items: ${report.totalDamageItems}`,
    "",
    "## Summary",
    "",
    report.summary.headline,
    "",
    "## Damage Items",
    ""
  ];

  if (!report.items.length) {
    lines.push("No visible damage candidates were found above the confidence threshold.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| Image | Frame | Damage | Vehicle part | Severity | Confidence | Evidence |");
  lines.push("| --- | ---: | --- | --- | --- | ---: | --- |");
  for (const item of report.items) {
    lines.push(
      `| ${escapeMarkdownCell(item.imageLabel)} | ${item.frameNumber} | ${escapeMarkdownCell(item.damageTypeLabel)} | ${escapeMarkdownCell(item.vehiclePart)} | ${escapeMarkdownCell(item.severity)} | ${item.confidencePercent}% | ${escapeMarkdownCell(item.evidence || item.sentence)} |`
    );
  }

  lines.push("", "## Image Links", "");
  for (const item of report.items) {
    lines.push(`- ${item.imageLabel}: ${item.imageUrl}`);
  }
  return `${lines.join("\n")}\n`;
}

function makeProviderRuns() {
  return Object.fromEntries(providerOrder.map((id) => {
    const provider = providers[id];
    return [id, {
      provider: id,
      label: provider.label,
      model: provider.publicModel,
      status: "idle",
      message: "Waiting for extracted frames",
      pipeline: buildProviderPipeline(),
      totalLatencyMs: null,
      error: null
    }];
  }));
}

function buildProviderPipeline() {
  return [
    { key: "inspect", label: "Inspect frames", status: "pending", detail: "Waiting for run", progress: 0 },
    { key: "dedupe", label: "Deduplicate", status: "pending", detail: "Waiting for findings", progress: 0 },
    { key: "annotate", label: "Annotate images", status: "pending", detail: "Waiting for damage list", progress: 0 },
    { key: "report", label: "Build report", status: "pending", detail: "Waiting for annotations", progress: 0 }
  ];
}

function buildPipeline() {
  return [
    { key: "upload", label: "Upload", status: "pending", detail: "Waiting for video", progress: 0 },
    { key: "extract", label: "Extract frames", status: "pending", detail: "Waiting for upload", progress: 0 },
    { key: "inspect", label: "Gemma 4 Inspection", status: "pending", detail: "Waiting for frames", progress: 0 },
    { key: "dedupe", label: "Deduplicate", status: "pending", detail: "Waiting for findings", progress: 0 },
    { key: "annotate", label: "Annotate images", status: "pending", detail: "Waiting for damage list", progress: 0 },
    { key: "report", label: "Build report", status: "pending", detail: "Waiting for annotations", progress: 0 }
  ];
}

function setProviderStep(job, providerId, key, status, detail, extra = {}) {
  const current = job.providerRuns?.[providerId] || makeProviderRuns()[providerId];
  const pipeline = Array.isArray(current.pipeline) ? current.pipeline : buildProviderPipeline();
  const index = pipeline.findIndex((step) => step.key === key);
  if (index === -1) return;
  const now = new Date().toISOString();
  const existing = pipeline[index];
  pipeline[index] = {
    ...existing,
    ...extra,
    status,
    detail,
    startedAt: existing.startedAt || (status === "active" ? now : undefined),
    completedAt: status === "complete" ? now : existing.completedAt
  };
  job.providerRuns[providerId] = {
    ...current,
    status: status === "failed" ? "failed" : current.status,
    message: detail,
    pipeline
  };
}

function updateComparisonProgress(job) {
  const runs = Object.values(job.providerRuns || {});
  const progressValues = runs.flatMap((run) => (run.pipeline || []).map((step) => Number(step.progress || 0)));
  const averageProgress = progressValues.length ? progressValues.reduce((total, value) => total + value, 0) / progressValues.length : 0;
  job.progress = Math.max(20, Math.min(98, Math.round(20 + averageProgress * 76)));
  const running = runs.filter((run) => run.status === "running").length;
  job.message = running ? `Running ${running} damage agent${running === 1 ? "" : "s"}` : job.message;
}

function setPipelineStep(job, key, status, detail, extra = {}) {
  const pipeline = Array.isArray(job.pipeline) ? job.pipeline : buildPipeline();
  const index = pipeline.findIndex((step) => step.key === key);
  if (index === -1) return;
  const now = new Date().toISOString();
  const existing = pipeline[index];
  pipeline[index] = {
    ...existing,
    ...extra,
    status,
    detail,
    startedAt: existing.startedAt || (status === "active" ? now : undefined),
    completedAt: status === "complete" ? now : existing.completedAt
  };
  job.pipeline = pipeline;
}

function emitJobEvent(job, type, payload) {
  const event = {
    type,
    at: new Date().toISOString(),
    ...payload
  };
  const sanitized = sanitizeEvent(event);
  job.events.push(sanitized);
  for (const subscriber of job.subscribers || []) subscriber(sanitized);
}

function writeSse(res, event) {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function sanitizeEvent(event) {
  const sanitized = { ...event };
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === "string") sanitized[key] = sanitizeTraceText(value);
  }
  if (sanitized.model) sanitized.model = sanitizePublicModel(sanitized.model);
  return sanitized;
}

function sanitizeTraceText(value) {
  return String(value || "")
    .replaceAll("OpenRouter", "GPU")
    .replaceAll("openrouter", "gpu")
    .replaceAll("api.openrouter.ai", "gpu.endpoint")
    .replaceAll("$OPENROUTER_API_KEY", "$GPU_API_KEY")
    .replaceAll("Google AI Studio", "GPU provider")
    .replaceAll("googleapis.com", "gpu.provider")
    .replaceAll("ai.google.dev", "gpu.provider")
    .replace(/:free\b/gi, "")
    .replace(/\bfree\b/gi, "standard");
}

function sanitizePublicModel(value) {
  return String(value || "").replace(/:free\b/gi, "");
}

function renderDamageCurl(provider, frameCount) {
  const keyLabel = provider.id === "gpu" ? "$GPU_API_KEY" : `$${provider.keyEnv}`;
  const imageSummary = `${frameCount} sampled image_url parts in multimodal batches of ${frameBatchSize}`;
  return sanitizeTraceText([
    `curl -s ${provider.apiHostLabel} \\`,
    `  -H "Authorization: Bearer ${keyLabel}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"model":"${provider.publicModel}","messages":[{"role":"user","content":[${imageSummary}, {"type":"text","text":"damage inspection prompt"}]}]}'`
  ].join("\n"));
}

function formatMs(ms) {
  if (!Number.isFinite(ms)) return "";
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

function failActivePipelineStep(job, error) {
  const pipeline = Array.isArray(job.pipeline) ? job.pipeline : buildPipeline();
  const active = pipeline.find((step) => step.status === "active") || pipeline.find((step) => step.status === "pending");
  if (active) {
    setPipelineStep(job, active.key, "failed", cleanText(error || "Step failed"));
  }
}

async function extractFrames(videoPath, framesDir, sampleFps, maxFrames, onProgress) {
  const duration = await probeDuration(videoPath);
  const effectiveFps = duration > 0 ? Math.min(sampleFps, maxFrames / duration) : sampleFps;
  const frameIntervalSeconds = effectiveFps > 0 ? 1 / effectiveFps : 1 / sampleFps;
  if (extractionMode === "sparse-sharp") {
    return extractSparseSharpFrames(videoPath, framesDir, {
      duration,
      sampleFps,
      effectiveFps,
      frameIntervalSeconds,
      maxFrames,
      onProgress
    });
  }

  await extractFramesSinglePass(videoPath, framesDir, { duration, effectiveFps, maxFrames, onProgress });

  return {
    durationSeconds: duration ? Number(duration.toFixed(2)) : null,
    requestedSampleFps: sampleFps,
    effectiveSampleFps: Number(effectiveFps.toFixed(3)),
    frameIntervalSeconds: Number(frameIntervalSeconds.toFixed(2)),
    maxFrames,
    extractionMode: "single-pass",
    extractionMaxWidth,
    extractionJpegQuality,
    ffmpegHwaccel
  };
}

async function extractSparseSharpFrames(videoPath, framesDir, { duration, sampleFps, effectiveFps, frameIntervalSeconds, maxFrames, onProgress }) {
  const targetCount = duration > 0 ? Math.min(maxFrames, Math.max(1, Math.ceil(duration * effectiveFps))) : maxFrames;
  const timestamps = Array.from({ length: targetCount }, (_, index) => {
    const centered = index * frameIntervalSeconds + frameIntervalSeconds / 2;
    return Math.max(0, duration > 0 ? Math.min(duration - 0.05, centered) : index * frameIntervalSeconds);
  });
  let blurRetries = 0;
  let hardwareFallbacks = 0;
  const sharpnessScores = [];

  onProgress?.({ progress: 0, detail: `Seeking ${timestamps.length} target frames` });

  await mapWithConcurrency(timestamps, extractionSeekWorkers, async (timestamp, index) => {
    const outputPath = path.join(framesDir, `frame-${String(index + 1).padStart(5, "0")}.jpg`);
    const result = await extractSharpFrameAtTimestamp(videoPath, outputPath, timestamp, duration, index + 1);
    blurRetries += result.blurRetries;
    hardwareFallbacks += result.hardwareFallbacks;
    sharpnessScores.push(result.sharpness);
    return result;
  }, (completed, total) => {
    onProgress?.({
      progress: total ? completed / total : 1,
      detail: `Seeked ${completed} of ${total} target frames`
    });
  });

  return {
    durationSeconds: duration ? Number(duration.toFixed(2)) : null,
    requestedSampleFps: sampleFps,
    effectiveSampleFps: Number(effectiveFps.toFixed(3)),
    frameIntervalSeconds: Number(frameIntervalSeconds.toFixed(2)),
    maxFrames,
    extractedFrames: timestamps.length,
    extractionMode: "sparse-sharp",
    extractionSeekWorkers,
    extractionBlurThreshold,
    blurRetries,
    averageSharpness: average(sharpnessScores),
    hardwareFallbacks,
    extractionMaxWidth,
    extractionJpegQuality,
    ffmpegHwaccel
  };
}

async function extractSharpFrameAtTimestamp(videoPath, outputPath, targetTimestamp, duration, frameNumber) {
  const offsets = [0, -0.25, 0.25, -0.5, 0.5, -0.75, 0.75];
  let best = null;
  let blurRetries = 0;
  let hardwareFallbacks = 0;

  for (const [offsetIndex, offset] of offsets.entries()) {
    const timestamp = clampTimestamp(targetTimestamp + offset, duration);
    const candidatePath = `${outputPath}.candidate-${offsetIndex}.png`;
    const usedFallback = await extractSingleSeekFrame(videoPath, candidatePath, timestamp);
    hardwareFallbacks += usedFallback ? 1 : 0;
    const sharpness = await scoreImageSharpness(candidatePath);
    if (!best || sharpness > best.sharpness) {
      if (best?.path && best.path !== candidatePath) await rm(best.path, { force: true });
      best = { path: candidatePath, sharpness, timestamp };
    } else {
      await rm(candidatePath, { force: true });
    }

    if (sharpness >= extractionBlurThreshold) break;
    blurRetries += 1;
  }

  if (!best) throw new Error(`Could not extract frame ${frameNumber}.`);
  await sharp(best.path).jpeg({ quality: extractionJpegQuality }).toFile(outputPath);
  await rm(best.path, { force: true });
  return { frameNumber, timestamp: best.timestamp, sharpness: Math.round(best.sharpness), blurRetries, hardwareFallbacks };
}

async function extractSingleSeekFrame(videoPath, outputPath, timestamp) {
  const buildArgs = (useHardwareDecode) => [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-threads",
    "0",
    "-ss",
    timestamp.toFixed(3),
    ...(useHardwareDecode ? ["-hwaccel", ffmpegHwaccel] : []),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-vf",
    `scale='min(${extractionMaxWidth},iw)':-2:flags=fast_bilinear`,
    "-y",
    outputPath
  ];

  try {
    await runFfmpeg(buildArgs(true));
    return false;
  } catch (_error) {
    await rm(outputPath, { force: true });
    await runFfmpeg(buildArgs(false));
    return true;
  }
}

async function extractFramesSinglePass(videoPath, framesDir, { duration, effectiveFps, maxFrames, onProgress }) {
  const ffmpegArgs = (useHardwareDecode) => [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-threads",
    "0",
    ...(useHardwareDecode ? ["-hwaccel", ffmpegHwaccel] : []),
    "-i",
    videoPath,
    "-vf",
    `fps=${effectiveFps.toFixed(6)},scale='min(${extractionMaxWidth},iw)':-2:flags=fast_bilinear`,
    "-frames:v",
    String(maxFrames),
    "-progress",
    "pipe:1",
    "-nostats",
    path.join(framesDir, "frame-%05d.jpg")
  ];

  try {
    await runFfmpeg(ffmpegArgs(true), { duration, maxFrames, onProgress });
  } catch (error) {
    await rm(framesDir, { recursive: true, force: true });
    await mkdir(framesDir, { recursive: true });
    onProgress?.({ progress: 0, detail: "Hardware decode unavailable, retrying standard extraction" });
    await runFfmpeg(ffmpegArgs(false), { duration, maxFrames, onProgress });
  }
}

function runFfmpeg(args, { duration, maxFrames, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args);
    let stderr = "";
    let stdoutBuffer = "";
    let lastFrame = 0;
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        const [key, value] = line.split("=");
        if (key === "frame") {
          const frame = Number(value);
          if (Number.isFinite(frame)) lastFrame = Math.max(lastFrame, frame);
        }
        if (key === "progress" || key === "frame" || key === "out_time_ms" || key === "out_time_us") {
          const frameProgress = maxFrames ? lastFrame / maxFrames : 0;
          const progress = Math.max(0, Math.min(0.98, frameProgress));
          onProgress?.({
            progress,
            detail: lastFrame
              ? `Extracted ${Math.min(lastFrame, maxFrames || lastFrame)} of ${maxFrames || "?"} target frames`
              : duration
                ? `Scanning ${Number(duration).toFixed(1)} seconds of video`
                : "Scanning video frames"
          });
        }
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        onProgress?.({ progress: 1, detail: `Extracted ${maxFrames || lastFrame || "target"} frames` });
        resolve();
      }
      else reject(new Error(`ffmpeg failed with code ${code}: ${stderr}`));
    });
  });
}

function probeDuration(videoPath) {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoPath
    ]);
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("close", (code) => {
      const duration = Number(stdout.trim());
      resolve(code === 0 && Number.isFinite(duration) ? duration : 0);
    });
    child.on("error", () => resolve(0));
  });
}

async function inspectFrameWithProvider(provider, framePath, frameNumber, totalFrames, tileConcurrency) {
  const base64 = await readFile(framePath, "base64");
  const metadata = await sharp(framePath).metadata();
  const imageWidth = metadata.width || 1920;
  const imageHeight = metadata.height || 1080;
  const generalPrompt = `You are inspecting rental-car walkaround video frames before a renter takes possession.

Find visible exterior vehicle damage in this single frame only. Prioritize small surface damage too, not just dents.

Damage examples to actively look for:
- scratches: thin bright/dark lines, clearcoat scratches, keyed marks, swirl clusters, scraped paint
- scuffs and paint transfer: bumper rubs, white/black transfer marks, cloudy abrasion, scraped corners
- chips and cracks: paint chips, windshield chips, cracked lights, hairline cracks in plastic trim
- deformation: dents, creases, bent panels, panel gaps, broken mirror, missing trim, wheel rash, rust

Be sensitive to subtle scratches and scuffs. Report plausible damage candidates when there is a visible localized cue, even if confidence is moderate. Use lower confidence for uncertain scratches instead of suppressing them. Reject reflections, shadows, dirt, water streaks, normal body seams, license plate text, and camera motion blur unless there is a clear damage cue.

Subtle dent cues matter: look for small circular depressions, soft concave dimples, warped highlight bands, crescent shadows, bent reflection lines, and local panel deformation on otherwise smooth silver or glossy panels. Dents often appear above wheel arches, beside door seams, under mirrors, and on quarter/fender panels. Report those as "dent" even when there is no paint damage.

Important: enumerate every distinct damage item visible in the frame. Do not merge a dent and nearby scratches into one detection. Do not use one large box for a panel if there are multiple separate defects. For example, if there is a dent above a wheel arch and scratches lower on the fender, return two detections: one labeled "dent" with its own bbox, and one labeled "scratches/scuffs" with its own bbox. Check wheel arches, quarter panels, fenders, doors, bumpers, mirror-adjacent panels, and panels above or below any scratches for additional dents.

Return strict JSON only with this shape:
{
  "frame_summary": "short description of view",
  "detections": [
    {
      "label": "short damage label",
      "damage_type": "scratch|scuff|dent|chip|crack|paint_transfer|wheel_rash|rust|broken_part|other",
      "confidence": 0.0,
      "severity": "minor|moderate|major",
      "location": "front bumper / driver door / rear quarter / etc",
      "bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 },
      "evidence": "why this looks damaged"
    }
  ]
}

Coordinates MUST be normalized decimals from 0 to 1 relative to image width and height, not pixel coordinates. If there is no visible damage, return an empty detections array. For long scratches, make the bounding box cover the full scratch path even if it is thin.
Every detection must include a bbox that tightly localizes the damage. If you can describe damage but cannot localize it, either omit it or use a wider bbox around the affected panel; never return a zero-size or missing bbox.

Frame ${frameNumber} of ${totalFrames}.`;

  const generalDetections = await inspectImageWithPrompt(provider, base64, generalPrompt, 900);
  const panelDetections = generalDetections.length
    ? await inspectPanelTiles(provider, framePath, imageWidth, imageHeight, frameNumber, totalFrames, tileConcurrency)
    : [];
  return [...generalDetections, ...panelDetections]
    .map((detection) => normalizeDetection(detection, imageWidth, imageHeight))
    .filter(Boolean);
}

async function inspectPanelTiles(provider, framePath, imageWidth, imageHeight, frameNumber, totalFrames, tileConcurrency) {
  const tilePrompt = `Inspect this crop from a rental-car walkaround frame. Find visible exterior damage in this crop.

Pay special attention to subtle dents: small circular depressions, warped highlight bands, concave dimples, crescent shadows, bent reflection lines, and distorted reflections on otherwise smooth silver or glossy panels. Also report scratches and scuffs separately.

Scan the whole crop, not just the most obvious mark. Do not merge a dent and nearby scratches into one detection.

Return strict JSON only with this shape:
{
  "detections": [
    {
      "label": "short damage label",
      "damage_type": "scratch|scuff|dent|chip|crack|paint_transfer|wheel_rash|rust|broken_part|other",
      "confidence": 0.0,
      "severity": "minor|moderate|major",
      "location": "front fender / driver door / rear quarter / etc",
      "bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 },
      "evidence": "specific visual cue"
    }
  ]
}

Coordinates MUST be normalized decimals from 0 to 1 within this crop, not pixel coordinates. If there is no visible damage in this crop, return an empty detections array.

Frame ${frameNumber} of ${totalFrames}.`;

  const tiles = buildTiles(imageWidth, imageHeight);
  const tileResults = await mapWithConcurrency(tiles, tileConcurrency, async (tile) => {
    const buffer = await sharp(framePath)
      .extract({ left: tile.x, top: tile.y, width: tile.w, height: tile.h })
      .jpeg({ quality: 92 })
      .toBuffer();
    const tileBase64 = buffer.toString("base64");
    const tileDetections = await inspectImageWithPrompt(provider, tileBase64, tilePrompt, 800);
    return tileDetections.map((detection) => mapTileDetectionToFrame(detection, tile, imageWidth, imageHeight));
  });
  return tileResults.flat();
}

async function inspectFramesWithBatches(provider, frameFiles, framesDir, _tileConcurrency, onProgress, emit) {
  const batches = chunkArray(frameFiles, frameBatchSize);
  const frameFindings = [];
  let completed = 0;
  emit("trace", {
    provider: provider.id,
    phase: "batch",
    message: `${provider.label} will inspect ${frameFiles.length} frames in ${batches.length} multimodal batch${batches.length === 1 ? "" : "es"} of up to ${frameBatchSize}`
  });

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batchFiles = batches[batchIndex];
    const frames = await Promise.all(batchFiles.map(async (filename) => {
      const frameNumber = frameFiles.indexOf(filename) + 1;
      const framePath = path.join(framesDir, filename);
      const [base64, metadata] = await Promise.all([
        readFile(framePath, "base64"),
        sharp(framePath).metadata()
      ]);
      return {
        frameNumber,
        filename,
        framePath,
        base64,
        imageWidth: metadata.width || 1920,
        imageHeight: metadata.height || 1080
      };
    }));

    emit("trace", {
      provider: provider.id,
      phase: "dispatch",
      message: `POST ${provider.apiHostLabel} batch ${batchIndex + 1}/${batches.length} with ${frames.length} frames`
    });
    const batchResults = await inspectFrameBatchWithProvider(provider, frames, batchIndex + 1, batches.length, frameFiles.length);
    frameFindings.push(...batchResults);
    completed += frames.length;
    onProgress(completed, frameFiles.length);
  }

  return frameFindings.sort((a, b) => a.frameNumber - b.frameNumber);
}

async function inspectFrameBatchWithProvider(provider, frames, batchNumber, batchCount, totalFrames) {
  const prompt = buildBatchDamagePrompt(frames, batchNumber, batchCount, totalFrames);
  const payload = {
    model: provider.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...frames.flatMap((frame) => [
            { type: "text", text: `Frame ${frame.frameNumber} filename: ${frame.filename}` },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${frame.base64}` } }
          ])
        ]
      }
    ],
    temperature: 0,
    response_format: { type: "json_object" }
  };
  const maxCompletionTokens = Math.max(1800, frames.length * 1200);
  if (provider.actualProvider === "openrouter") {
    payload.max_tokens = maxCompletionTokens;
  } else {
    payload.max_completion_tokens = maxCompletionTokens;
  }

  const response = await fetch(provider.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env[provider.keyEnv]}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "damage-scout-demo/0.1",
      ...(provider.actualProvider === "openrouter" ? {
        "HTTP-Referer": "http://127.0.0.1:5173",
        "X-Title": "Damage Scout"
      } : {})
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(formatProviderError(provider, response.status, body));
  }

  const content = body.choices?.[0]?.message?.content || "{}";
  const parsed = parseJsonContent(content);
  const byFrame = collectBatchFrameDetections(parsed, frames);

  return frames.map((frame) => ({
    frameNumber: frame.frameNumber,
    filename: frame.filename,
    framePath: frame.framePath,
    findings: (byFrame.get(frame.frameNumber) || [])
      .map((detection) => normalizeDetection(detection, frame.imageWidth, frame.imageHeight))
      .filter(Boolean)
  }));
}

function buildBatchDamagePrompt(frames, batchNumber, batchCount, totalFrames) {
  const frameList = frames.map((frame) => `- Frame ${frame.frameNumber}: ${frame.filename}`).join("\n");
  const frameNumberList = frames.map((frame) => frame.frameNumber).join(", ");
  return `You are inspecting rental-car walkaround video frames before a renter takes possession.

Find visible exterior vehicle damage in EACH frame independently. Prioritize small surface damage too, not just dents.

Damage examples to actively look for:
- scratches: thin bright/dark lines, clearcoat scratches, keyed marks, swirl clusters, scraped paint
- scuffs and paint transfer: bumper rubs, white/black transfer marks, cloudy abrasion, scraped corners
- chips and cracks: paint chips, windshield chips, cracked lights, hairline cracks in plastic trim
- deformation: dents, creases, bent panels, panel gaps, broken mirror, missing trim, wheel rash, rust

Rules:
- Return JSON only. No markdown. No prose.
- Return exactly one top-level object with a "frames" array.
- The "frames" array MUST contain exactly ${frames.length} frame objects, one for every listed frame, in the same order.
- Required frame_number sequence: [${frameNumberList}].
- Every frame object MUST have exactly one frame_number field and one detections array.
- Never merge two frame objects together. Never repeat frame_number inside the same object.
- Treat each frame independently. Do not copy detections from one frame to another.
- Enumerate every distinct damage item visible in each frame. Do not limit yourself to one detection per frame.
- If a frame has multiple defects, return multiple detections for that frame.
- Do not stop after the most obvious mark. Check wheel arches, quarter panels, fenders, doors, bumpers, mirror-adjacent panels, rocker panels, lights, and wheels.
- Do not merge a dent and nearby scratches into one detection. If a dent sits near scratches or scuffs, return separate boxes.
- Use lower confidence for uncertain scratches instead of suppressing them.
- Reject reflections, shadows, dirt, water streaks, normal body seams, license plate text, and camera motion blur unless there is a clear damage cue.
- Subtle dent cues matter: small circular depressions, soft concave dimples, warped highlight bands, crescent shadows, bent reflection lines, and local panel deformation on otherwise smooth silver or glossy panels.
- Coordinates MUST be normalized decimals from 0 to 1 relative to that frame.
- Every detection must include a tight bbox. For long scratches, cover the full scratch path even if it is thin.
- If there is no visible damage in a frame, return that frame with an empty detections array.

Batch ${batchNumber} of ${batchCount}. Total sampled frames: ${totalFrames}.
Frames in this batch:
${frameList}

Return this exact JSON shape:
{
  "frames": [
    {
      "frame_number": ${frames[0]?.frameNumber || 1},
      "detections": [
        {
          "label": "short damage label",
          "damage_type": "scratch|scuff|dent|chip|crack|paint_transfer|wheel_rash|rust|broken_part|other",
          "confidence": 0.0,
          "severity": "minor|moderate|major",
          "location": "front bumper / driver door / rear quarter / etc",
          "bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 },
          "evidence": "why this looks damaged"
        }
      ]
    }
  ]
}`;
}

async function inspectImageWithPrompt(provider, base64, prompt, maxCompletionTokens) {
  const payload = {
    model: provider.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
          { type: "text", text: prompt }
        ]
      }
    ],
    temperature: 0,
    response_format: { type: "json_object" }
  };
  if (provider.actualProvider === "openrouter") {
    payload.max_tokens = maxCompletionTokens;
  } else {
    payload.max_completion_tokens = maxCompletionTokens;
  }

  const response = await fetch(provider.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env[provider.keyEnv]}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "damage-scout-demo/0.1",
      ...(provider.actualProvider === "openrouter" ? {
        "HTTP-Referer": "http://127.0.0.1:5173",
        "X-Title": "Damage Scout"
      } : {})
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(formatProviderError(provider, response.status, body));
  }

  const content = body.choices?.[0]?.message?.content || "{}";
  const parsed = parseJsonContent(content);
  return Array.isArray(parsed.detections) ? parsed.detections : [];
}

async function preflightProvider(provider, framePath, emit) {
  if (provider.actualProvider !== "openrouter") return;
  emit("trace", {
    provider: provider.id,
    phase: "preflight",
    message: `Testing ${provider.apiHostLabel} with one extracted frame`
  });
  const base64 = await readFile(framePath, "base64");
  const payload = {
    model: provider.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
          { type: "text", text: "Reply with JSON only: {\"ok\":true}" }
        ]
      }
    ],
    temperature: 0,
    max_tokens: 48,
    response_format: { type: "json_object" }
  };
  const response = await fetch(provider.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env[provider.keyEnv]}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "damage-scout-demo/0.1",
      "HTTP-Referer": "http://127.0.0.1:5173",
      "X-Title": "Damage Scout"
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(formatProviderError(provider, response.status, body, "preflight"));
  emit("trace", {
    provider: provider.id,
    phase: "response",
    message: "GPU vision preflight passed"
  });
}

function formatProviderError(provider, status, body, context = "request") {
  const rawMessage = String(body?.error?.message || body?.message || JSON.stringify(body || {}));
  const text = rawMessage.toLowerCase();
  if (status === 429 || text.includes("quota") || text.includes("rate limit") || text.includes("resource_exhausted")) {
    return `${provider.label} ${context} rate limited. Retry in a moment or reduce the frame count.`;
  }
  if (status === 401 || status === 403) {
    return `${provider.label} ${context} authentication failed. Check the server-side API key.`;
  }
  if (status >= 500) {
    return `${provider.label} ${context} returned HTTP ${status}. Retry shortly.`;
  }
  return `${provider.label} ${context} failed with HTTP ${status}: ${cleanText(sanitizeTraceText(rawMessage))}`;
}

function parseJsonContent(content) {
  const stripped = String(content || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  const direct = tryParseJson(stripped);
  if (direct !== null) return direct;

  const arrayStart = stripped.indexOf("[");
  const arrayEnd = stripped.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    const parsedArray = tryParseJson(stripped.slice(arrayStart, arrayEnd + 1));
    if (parsedArray !== null) return parsedArray;
  }

  const objectStart = stripped.indexOf("{");
  const objectEnd = stripped.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    const parsedObject = tryParseJson(stripped.slice(objectStart, objectEnd + 1));
    if (parsedObject !== null) return parsedObject;
  }

  return {};
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function collectBatchFrameDetections(parsed, frames) {
  const byFrame = new Map(frames.map((frame) => [frame.frameNumber, []]));
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.frames) ? parsed.frames : [];

  if (!items.length && Array.isArray(parsed?.detections) && frames.length === 1) {
    byFrame.set(frames[0].frameNumber, parsed.detections);
    return byFrame;
  }

  items.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const fallbackFrameNumber = frames[index]?.frameNumber;
    const frameNumber = Number(item.frame_number || item.frameNumber || fallbackFrameNumber);
    if (!byFrame.has(frameNumber)) return;
    byFrame.set(frameNumber, Array.isArray(item.detections) ? item.detections : []);
  });

  return byFrame;
}

function buildTiles(imageWidth, imageHeight) {
  const tileWidth = Math.min(imageWidth, Math.round((imageWidth / 3) * 1.35));
  const tileHeight = Math.min(imageHeight, Math.round((imageHeight / 2) * 1.35));
  const xs = uniqueNumbers([0, Math.round((imageWidth - tileWidth) / 2), imageWidth - tileWidth]);
  const ys = uniqueNumbers([0, imageHeight - tileHeight]);
  const tiles = [];
  for (const y of ys) {
    for (const x of xs) {
      tiles.push({ x, y, w: tileWidth, h: tileHeight });
    }
  }
  return tiles;
}

function mapTileDetectionToFrame(detection, tile, imageWidth, imageHeight) {
  const bbox = detection?.bbox || {};
  let x = Number(bbox.x);
  let y = Number(bbox.y);
  let w = Number(bbox.w);
  let h = Number(bbox.h);
  if ([x, y, w, h].some((value) => Number.isFinite(value) && value > 1)) {
    x /= tile.w;
    y /= tile.h;
    w /= tile.w;
    h /= tile.h;
  }
  return {
    ...detection,
    bbox: {
      x: (tile.x + x * tile.w) / imageWidth,
      y: (tile.y + y * tile.h) / imageHeight,
      w: (w * tile.w) / imageWidth,
      h: (h * tile.h) / imageHeight
    }
  };
}

function normalizeDetection(input, imageWidth = 1920, imageHeight = 1080) {
  const bbox = input?.bbox || {};
  const confidence = Number(input?.confidence);
  if (!Number.isFinite(confidence)) return null;
  let rawBox = {
    x: Number(bbox.x),
    y: Number(bbox.y),
    w: Number(bbox.w),
    h: Number(bbox.h)
  };
  if ([rawBox.x, rawBox.y, rawBox.w, rawBox.h].some((value) => Number.isFinite(value) && value > 1)) {
    rawBox = {
      x: rawBox.x / imageWidth,
      y: rawBox.y / imageHeight,
      w: rawBox.w / imageWidth,
      h: rawBox.h / imageHeight
    };
  }
  const hasUsableBox =
    Number.isFinite(rawBox.x) &&
    Number.isFinite(rawBox.y) &&
    Number.isFinite(rawBox.w) &&
    Number.isFinite(rawBox.h) &&
    rawBox.w >= 0.015 &&
    rawBox.h >= 0.015;
  const normalized = {
    label: cleanText(input.label || "visible damage"),
    damageType: damageTypeFor(input.damage_type || input.label || "other"),
    confidence: Math.max(0, Math.min(1, confidence)),
    severity: ["minor", "moderate", "major"].includes(input.severity) ? input.severity : "minor",
    location: cleanText(input.location || "unknown area"),
    bboxApproximate: !hasUsableBox,
    bbox: {
      x: hasUsableBox ? Math.max(0, Math.min(0.965, rawBox.x)) : 0.06,
      y: hasUsableBox ? Math.max(0, Math.min(0.965, rawBox.y)) : 0.06,
      w: hasUsableBox ? Math.max(0.035, Math.min(1, rawBox.w)) : 0.88,
      h: hasUsableBox ? Math.max(0.035, Math.min(1, rawBox.h)) : 0.88
    },
    evidence: cleanText(input.evidence || "")
  };
  normalized.bbox.w = Math.min(normalized.bbox.w, 1 - normalized.bbox.x);
  normalized.bbox.h = Math.min(normalized.bbox.h, 1 - normalized.bbox.y);
  normalized.bbox.w = Math.max(0.035, normalized.bbox.w);
  normalized.bbox.h = Math.max(0.035, normalized.bbox.h);
  return normalized;
}

function damageTypeFor(value) {
  const text = cleanText(value).toLowerCase();
  if (text.includes("dent") || text.includes("depression") || text.includes("crease")) return "dent";
  if (text.includes("scratch") || text.includes("scrape") || text.includes("keyed")) return "scratch";
  if (text.includes("scuff") || text.includes("abrasion")) return "scuff";
  if (text.includes("paint transfer") || text.includes("transfer")) return "paint_transfer";
  if (text.includes("chip")) return "chip";
  if (text.includes("crack")) return "crack";
  if (text.includes("rash") || text.includes("wheel")) return "wheel_rash";
  if (text.includes("rust")) return "rust";
  if (text.includes("broken") || text.includes("missing")) return "broken_part";
  return "other";
}

function formatDamageType(value) {
  return cleanText(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Other";
}

function cleanVehiclePart(value) {
  const text = cleanText(value || "unknown area").toLowerCase();
  if (!text || text === "unknown") return "unknown area";
  return text;
}

function articleFor(value) {
  return /^[aeiou]/i.test(value) ? "an" : "a";
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = cleanText(getKey(item) || "unknown");
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function escapeMarkdownCell(value) {
  return cleanText(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

function dedupeFindings(frameFindings, confidenceFloor) {
  const candidates = [];
  for (const frame of frameFindings) {
    for (const finding of frame.findings) {
      if (finding.confidence < confidenceFloor) continue;
      candidates.push({ ...finding, frameNumber: frame.frameNumber, sourceFrame: frame.filename });
    }
  }

  candidates.sort((a, b) => {
    if (Boolean(a.bboxApproximate) !== Boolean(b.bboxApproximate)) {
      return a.bboxApproximate ? 1 : -1;
    }
    return b.confidence - a.confidence;
  });
  const selected = [];
  for (const candidate of candidates) {
    const duplicate = selected.some((existing) => {
      const sameDamageType = existing.damageType === candidate.damageType || tokenOverlap(existing.label, candidate.label) >= 0.5;
      if (!sameDamageType) return false;
      const nearbyFrame = Math.abs(existing.frameNumber - candidate.frameNumber) <= 2;
      const sameFrame = existing.frameNumber === candidate.frameNumber;
      const overlappingBox = iou(existing.bbox, candidate.bbox);
      if (sameFrame) return overlappingBox > 0.34;
      return nearbyFrame && overlappingBox > 0.46;
    });
    if (!duplicate) selected.push(candidate);
  }
  return selected.sort((a, b) => a.frameNumber - b.frameNumber);
}

async function annotateFrame(inputPath, outputPath, detection) {
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  const width = metadata.width || 1280;
  const height = metadata.height || 720;
  const box = {
    x: Math.round(detection.bbox.x * width),
    y: Math.round(detection.bbox.y * height),
    w: Math.round(detection.bbox.w * width),
    h: Math.round(detection.bbox.h * height)
  };
  box.x = Math.max(6, Math.min(width - 24, box.x));
  box.y = Math.max(6, Math.min(height - 24, box.y));
  box.w = Math.max(42, Math.min(width - box.x - 6, box.w));
  box.h = Math.max(42, Math.min(height - box.y - 6, box.h));
  const label = `${detection.label} ${Math.round(detection.confidence * 100)}%${detection.bboxApproximate ? " review area" : ""}`;
  const labelWidth = Math.min(width - box.x - 8, Math.max(240, label.length * 10));
  const labelY = box.y > 42 ? box.y - 36 : Math.min(height - 38, box.y + box.h + 8);
  const dash = detection.bboxApproximate ? 'stroke-dasharray="14 10"' : "";
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="rgba(255, 204, 51, 0.08)" stroke="#ffcc33" stroke-width="5" ${dash}/>
    <rect x="${box.x}" y="${labelY}" width="${labelWidth}" height="30" fill="#111111" opacity="0.88"/>
    <text x="${box.x + 10}" y="${labelY + 21}" fill="#ffcc33" font-size="18" font-family="Arial, sans-serif" font-weight="700">${escapeXml(label)}</text>
  </svg>`;
  await image.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 92 }).toFile(outputPath);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function clampInteger(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function clampTimestamp(value, duration) {
  if (!Number.isFinite(value)) return 0;
  if (!duration || duration <= 0) return Math.max(0, value);
  return Math.max(0, Math.min(duration - 0.05, value));
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return null;
  return Math.round(valid.reduce((total, value) => total + value, 0) / valid.length);
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function scoreImageSharpness(imagePath) {
  const { data, info } = await sharp(imagePath)
    .greyscale()
    .resize({ width: 320, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width < 3 || info.height < 3) return 0;
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < info.height - 1; y += 1) {
    for (let x = 1; x < info.width - 1; x += 1) {
      const center = data[y * info.width + x] * 4;
      const laplacian = center
        - data[y * info.width + x - 1]
        - data[y * info.width + x + 1]
        - data[(y - 1) * info.width + x]
        - data[(y + 1) * info.width + x];
      sum += laplacian;
      sumSquares += laplacian * laplacian;
      count += 1;
    }
  }
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

async function mapWithConcurrency(items, concurrency, worker, onProgress) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
        completed += 1;
        onProgress?.(completed, items.length);
      }
    })
  );

  return results;
}

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => Math.max(0, Math.round(value))))];
}

function cleanText(value) {
  return String(value).replace(/\s+/g, " ").trim().slice(0, 220);
}

function slugify(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "damage";
}

function tokenOverlap(a, b) {
  const left = new Set(cleanText(a).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const right = new Set(cleanText(b).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }
  return shared / Math.min(left.size, right.size);
}

function iou(a, b) {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const intersection = ix * iy;
  const union = a.w * a.h + b.w * b.h - intersection;
  return union > 0 ? intersection / union : 0;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
