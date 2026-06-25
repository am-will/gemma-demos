import express from "express";
import cors from "cors";
import multer from "multer";
import { nanoid } from "nanoid";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
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
const model = process.env.CEREBRAS_MODEL || "gemma-4-31b-trial";
const port = Number(process.env.PORT || 8787);
const extractionMaxWidth = Number(process.env.FRAME_EXTRACTION_MAX_WIDTH || 1920);
const extractionJpegQuality = Number(process.env.FRAME_EXTRACTION_JPEG_QUALITY || 92);
const ffmpegHwaccel = process.env.FFMPEG_HWACCEL || (process.platform === "darwin" ? "videotoolbox" : "auto");
const extractionMode = process.env.FRAME_EXTRACTION_MODE || "sparse-sharp";
const extractionSeekWorkers = clampInteger(process.env.FRAME_EXTRACTION_SEEK_WORKERS, 1, 8, 4);
const extractionBlurThreshold = Number(process.env.FRAME_EXTRACTION_BLUR_THRESHOLD || 85);

await Promise.all([mkdir(uploadsDir, { recursive: true }), mkdir(tmpDir, { recursive: true }), mkdir(outputsDir, { recursive: true })]);

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 1024 * 1024 * 500 }
});

const jobs = new Map();
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/outputs", express.static(path.join(rootDir, "outputs")));
app.use(express.static(distDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model, hasKey: Boolean(process.env.CEREBRAS_API_KEY) });
});

app.post("/api/analyze", upload.single("video"), async (req, res) => {
  if (!process.env.CEREBRAS_API_KEY) {
    res.status(500).json({ error: "Missing CEREBRAS_API_KEY. Create .env or export it before starting the server." });
    return;
  }
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
  const job = {
    id: jobId,
    status: "queued",
    progress: 0,
    message: "Queued video inspection",
    createdAt: new Date().toISOString(),
    settings: { sampleFps, maxFrames, confidenceFloor, frameConcurrency, tileConcurrency, model, extractionMaxWidth, extractionJpegQuality, extractionMode },
    pipeline: buildPipeline(),
    result: null,
    error: null
  };
  jobs.set(jobId, job);
  res.status(202).json({ jobId });

  processExtractionJob(job, req.file.path, req.file.originalname).catch((error) => {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.message = "Frame extraction failed";
    failActivePipelineStep(job, job.error);
  });
});

app.post("/api/jobs/:jobId/inspect", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Unknown job" });
    return;
  }
  if (job.status !== "extracted") {
    res.status(409).json({ error: `Job is ${job.status}; it must be extracted before Gemma inspection can start.` });
    return;
  }
  res.status(202).json({ jobId: job.id });
  continueInspectionJob(job).catch((error) => {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.message = "Analysis failed";
    failActivePipelineStep(job, job.error);
  });
});

app.get("/api/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Unknown job" });
    return;
  }
  const { internal: _internal, ...publicJob } = job;
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

app.listen(port, "127.0.0.1", () => {
  console.log(`Damage Scout API listening on http://127.0.0.1:${port}`);
});

async function processExtractionJob(job, videoPath, originalName) {
  const jobTmp = path.join(tmpDir, job.id);
  const jobOut = path.join(outputsDir, job.id);
  const framesDir = path.join(jobTmp, "frames");
  await Promise.all([mkdir(framesDir, { recursive: true }), mkdir(jobOut, { recursive: true })]);

  job.status = "processing";
  job.pipeline = buildPipeline();
  setPipelineStep(job, "upload", "complete", `Received ${originalName}`, { progress: 1 });
  setPipelineStep(job, "extract", "active", "Starting ffmpeg frame extraction", { progress: 0 });
  job.message = "Extracting representative frames";
  job.progress = 5;

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
  job.message = `Extracted ${frameFiles.length} frame${frameFiles.length === 1 ? "" : "s"}. Ready for Gemma inspection.`;
  job.internal = { videoPath, originalName, jobTmp, jobOut, framesDir, frameFiles, extraction };
}

async function continueInspectionJob(job) {
  const { videoPath, originalName, jobTmp, jobOut, framesDir, frameFiles, extraction } = job.internal || {};
  if (!framesDir || !jobOut || !Array.isArray(frameFiles) || !extraction) {
    throw new Error("Extracted frame data is missing. Upload the video again.");
  }

  job.status = "inspecting";
  const inspectionStartedAt = Date.now();
  setPipelineStep(job, "inspect", "active", `0 of ${frameFiles.length} frames inspected`, { progress: 0 });
  job.message = `Gemma is inspecting ${frameFiles.length} sampled frames with ${job.settings.frameConcurrency} parallel workers`;
  const frameFindings = await mapWithConcurrency(
    frameFiles,
    job.settings.frameConcurrency,
    async (filename, index) => {
      const framePath = path.join(framesDir, filename);
      const frameNumber = index + 1;
      const findings = await inspectFrameWithGemma(framePath, frameNumber, frameFiles.length, job.settings.tileConcurrency);
      return { frameNumber, filename, framePath, findings };
    },
    (completed, total) => {
      const progress = completed / total;
      setPipelineStep(job, "inspect", "active", `${completed} of ${total} frames inspected`, {
        progress,
        elapsedMs: Date.now() - inspectionStartedAt
      });
      job.progress = Math.round(18 + progress * 62);
      job.message = `Inspected ${completed} of ${total} sampled frames`;
    }
  );
  setPipelineStep(job, "inspect", "complete", `Inspected ${frameFiles.length} sampled frame${frameFiles.length === 1 ? "" : "s"}`, {
    progress: 1,
    elapsedMs: Date.now() - inspectionStartedAt
  });

  const dedupeStartedAt = Date.now();
  setPipelineStep(job, "dedupe", "active", "Merging repeated sightings", { progress: 0 });
  job.message = "Deduplicating visible damage";
  job.progress = 84;
  const detections = dedupeFindings(frameFindings, job.settings.confidenceFloor);
  setPipelineStep(job, "dedupe", "complete", `${detections.length} unique damage candidate${detections.length === 1 ? "" : "s"}`, {
    progress: 1,
    elapsedMs: Date.now() - dedupeStartedAt
  });

  const annotationStartedAt = Date.now();
  setPipelineStep(job, "annotate", "active", "Drawing evidence boxes", { progress: 0 });
  job.message = "Drawing annotated evidence frames";
  const annotated = [];
  for (let i = 0; i < detections.length; i += 1) {
    const detection = detections[i];
    const frame = frameFindings.find((item) => item.frameNumber === detection.frameNumber);
    if (!frame) continue;
    const imageNumber = annotated.length + 1;
    const outputName = `damage-${String(i + 1).padStart(2, "0")}-${slugify(detection.label)}.jpg`;
    const outputPath = path.join(jobOut, outputName);
    await annotateFrame(frame.framePath, outputPath, detection);
    annotated.push({
      ...detection,
      imageNumber,
      imageLabel: `Image ${imageNumber}`,
      imageFilename: outputName,
      imageUrl: `/outputs/jobs/${job.id}/${outputName}`
    });
    setPipelineStep(job, "annotate", "active", `${annotated.length} of ${detections.length} evidence images drawn`, {
      progress: detections.length ? annotated.length / detections.length : 1,
      elapsedMs: Date.now() - annotationStartedAt
    });
  }
  setPipelineStep(job, "annotate", "complete", `${annotated.length} evidence image${annotated.length === 1 ? "" : "s"} ready`, {
    progress: 1,
    elapsedMs: Date.now() - annotationStartedAt
  });

  const reportStartedAt = Date.now();
  setPipelineStep(job, "report", "active", "Writing report artifacts", { progress: 0 });
  const report = buildDamageReport({
    jobId: job.id,
    originalName,
    model,
    settings: job.settings,
    extraction,
    sampledFrames: frameFiles.length,
    detections: annotated
  });
  await writeFile(path.join(jobOut, "damage-report.json"), JSON.stringify(report, null, 2));
  await writeFile(path.join(jobOut, "damage-report.md"), renderDamageReportMarkdown(report));
  setPipelineStep(job, "report", "complete", "Report JSON and Markdown written", {
    progress: 1,
    elapsedMs: Date.now() - reportStartedAt
  });

  const manifest = {
    jobId: job.id,
    originalName,
    model,
    createdAt: new Date().toISOString(),
    settings: job.settings,
    extraction,
    sampledFrames: frameFiles.length,
    report,
    reportUrl: `/outputs/jobs/${job.id}/damage-report.json`,
    reportMarkdownUrl: `/outputs/jobs/${job.id}/damage-report.md`,
    detections: annotated,
    rawFrameFindings: frameFindings.map(({ frameNumber, filename, findings }) => ({ frameNumber, filename, findings }))
  };
  await writeFile(path.join(jobOut, "manifest.json"), JSON.stringify(manifest, null, 2));
  await rm(jobTmp, { recursive: true, force: true });
  await rm(videoPath, { force: true });

  job.status = "complete";
  job.progress = 100;
  job.message = annotated.length ? `Found ${annotated.length} unique damage candidate${annotated.length === 1 ? "" : "s"}` : "No visible damage candidates found";
  job.result = { ...manifest, manifestUrl: `/outputs/jobs/${job.id}/manifest.json` };
  delete job.internal;
}

function buildDamageReport({ jobId, originalName, model, settings, extraction, sampledFrames, detections }) {
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

async function inspectFrameWithGemma(framePath, frameNumber, totalFrames, tileConcurrency) {
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

  const generalDetections = await inspectImageWithPrompt(base64, generalPrompt, 900);
  const panelDetections = generalDetections.length
    ? await inspectPanelTiles(framePath, imageWidth, imageHeight, frameNumber, totalFrames, tileConcurrency)
    : [];
  return [...generalDetections, ...panelDetections]
    .map((detection) => normalizeDetection(detection, imageWidth, imageHeight))
    .filter(Boolean);
}

async function inspectPanelTiles(framePath, imageWidth, imageHeight, frameNumber, totalFrames, tileConcurrency) {
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
    const tileDetections = await inspectImageWithPrompt(tileBase64, tilePrompt, 800);
    return tileDetections.map((detection) => mapTileDetectionToFrame(detection, tile, imageWidth, imageHeight));
  });
  return tileResults.flat();
}

async function inspectImageWithPrompt(base64, prompt, maxCompletionTokens) {
  const payload = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
          { type: "text", text: prompt }
        ]
      }
    ],
    max_completion_tokens: maxCompletionTokens,
    temperature: 0,
    response_format: { type: "json_object" }
  };

  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "damage-scout-demo/0.1"
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Cerebras API ${response.status}: ${body.message || JSON.stringify(body)}`);
  }

  const content = body.choices?.[0]?.message?.content || "{}";
  const parsed = parseJsonContent(content);
  return Array.isArray(parsed.detections) ? parsed.detections : [];
}

function parseJsonContent(content) {
  const stripped = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
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
      const samePanel = tokenOverlap(existing.location, candidate.location) >= 0.5;
      const overlappingBox = iou(existing.bbox, candidate.bbox) > 0.22;
      return overlappingBox || (nearbyFrame && samePanel);
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
