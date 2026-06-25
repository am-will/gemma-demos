import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, CheckCircle2, Clipboard, Copy, Film, FolderOpen, Gauge, Hourglass, Search, UploadCloud } from "lucide-react";
import "./styles.css";

const api = "";

function App() {
  const [file, setFile] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [settings, setSettings] = useState({ sampleFps: 0.5, maxFrames: 20, confidenceFloor: 0.35, frameConcurrency: 4, tileConcurrency: 3 });
  const [previewUrl, setPreviewUrl] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    if (!jobId) return undefined;
    const interval = setInterval(async () => {
      const response = await fetch(`${api}/api/jobs/${jobId}`);
      const data = await response.json();
      setJob(data);
      if (["complete", "failed"].includes(data.status)) clearInterval(interval);
    }, 900);
    return () => clearInterval(interval);
  }, [jobId]);

  const detections = job?.result?.detections || [];
  const report = job?.result?.report || null;
  const complete = job?.status === "complete";
  const busy = job && !["complete", "failed"].includes(job.status);
  const reportText = useMemo(() => (report ? formatReportText(report) : ""), [report]);

  async function startAnalysis() {
    if (!file || busy) return;
    setError("");
    setJob(makeUploadJob(0));
    setJobId(null);
    const form = new FormData();
    form.append("video", file);
    form.append("sampleFps", settings.sampleFps);
    form.append("maxFrames", settings.maxFrames);
    form.append("confidenceFloor", settings.confidenceFloor);
    form.append("frameConcurrency", settings.frameConcurrency);
    form.append("tileConcurrency", settings.tileConcurrency);

    let data;
    try {
      data = await uploadAnalysis(form, (percent) => setJob(makeUploadJob(percent)));
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Upload failed";
      setError(message);
      setJob({
        status: "failed",
        progress: 0,
        message,
        pipeline: makeUploadPipeline(0, "failed")
      });
      return;
    }
    setJobId(data.jobId);
    setJob({ status: "queued", progress: 3, message: "Queued video inspection", pipeline: makeUploadPipeline(100, "complete") });
    setCopied(false);
  }

  async function copyReport() {
    if (!reportText) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(reportText);
    } else {
      const element = document.createElement("textarea");
      element.value = reportText;
      element.setAttribute("readonly", "");
      element.style.position = "fixed";
      element.style.left = "-9999px";
      document.body.appendChild(element);
      element.select();
      document.execCommand("copy");
      document.body.removeChild(element);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function cuePreviewFrame(event) {
    const video = event.currentTarget;
    try {
      video.currentTime = Math.min(0.1, Math.max(0, video.duration || 0));
    } catch {
      // Some browsers delay seeking until more video data is buffered.
    }
  }

  const statusTone = useMemo(() => {
    if (job?.status === "failed") return "bad";
    if (complete) return "good";
    if (busy) return "active";
    return "idle";
  }, [job?.status, complete, busy]);

  return (
    <main className="shell">
      <span className="confetti c1" aria-hidden="true" />
      <span className="confetti c2" aria-hidden="true" />
      <span className="confetti c3" aria-hidden="true" />
      <span className="confetti c4" aria-hidden="true" />

      <section className="mast">
        <div>
          <p className="eyebrow">Rental fleet intake</p>
          <h1>Damage <span className="pop">Scout</span></h1>
          <p className="lede">Upload a walkaround video. Gemma 4 samples the full pass around the car, finds scratches, scuffs, dents, chips, and cracks, then returns deduplicated annotated evidence stills.</p>
        </div>
        <div className={`status ${statusTone}`}>
          <Gauge size={18} />
          <span>{job?.message || "Ready for inspection"}</span>
        </div>
      </section>

      <section className="workbench">
        <div className="uploadPanel">
          <button className={`drop ${previewUrl ? "hasPreview" : ""}`} onClick={() => inputRef.current?.click()} type="button">
            {previewUrl ? (
              <video
                className="dropPreview"
                src={previewUrl}
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={cuePreviewFrame}
                onLoadedData={(event) => event.currentTarget.pause()}
              />
            ) : null}
            <span className="dropOverlay">
              <UploadCloud className="dropIcon" size={34} />
              <strong>{file ? file.name : "Choose walkaround video"}</strong>
              <span>{file ? `${formatBytes(file.size)} selected` : "MP4, MOV, or WebM. Keep hackathon demos under a minute for fast iteration."}</span>
            </span>
          </button>
          <input ref={inputRef} hidden type="file" accept="video/*" onChange={(event) => setFile(event.target.files?.[0] || null)} />

          <div className="controls">
            <label>
              <span>FPS</span>
              <input type="number" step="0.2" min="0.2" max="3" value={settings.sampleFps} onChange={(event) => setSettings({ ...settings, sampleFps: event.target.value })} />
            </label>
            <label>
              <span>Frames</span>
              <input type="number" min="1" max="80" value={settings.maxFrames} onChange={(event) => setSettings({ ...settings, maxFrames: event.target.value })} />
            </label>
            <label>
              <span>Confidence</span>
              <input type="number" step="0.05" min="0" max="1" value={settings.confidenceFloor} onChange={(event) => setSettings({ ...settings, confidenceFloor: event.target.value })} />
            </label>
            <label>
              <span>Frame jobs</span>
              <input type="number" min="1" max="8" value={settings.frameConcurrency} onChange={(event) => setSettings({ ...settings, frameConcurrency: event.target.value })} />
            </label>
            <label>
              <span>Tile jobs</span>
              <input type="number" min="1" max="6" value={settings.tileConcurrency} onChange={(event) => setSettings({ ...settings, tileConcurrency: event.target.value })} />
            </label>
          </div>

          <button className="primary" disabled={!file || busy} onClick={startAnalysis} type="button">
            <Search size={18} />
            <span>{busy ? "Inspecting..." : "Run Gemma inspection"}</span>
          </button>
          {error ? <p className="error"><AlertTriangle size={16} />{error}</p> : null}
        </div>

        <div className="progressPanel">
          <div className="meterHeader">
            <Film size={20} />
            <span>{job?.status || "No job yet"}</span>
            <strong>{job?.progress || 0}%</strong>
          </div>
          <div className="meter"><div style={{ width: `${job?.progress || 0}%` }} /></div>
          <div className="processDashboard">
            {(job?.pipeline || makeIdlePipeline()).filter((step) => step.key !== "upload").map((step) => (
              <div className={`processStep ${step.status}`} key={step.key}>
                <span className="processDot" aria-hidden="true" />
                <div className="processCopy">
                  <strong>{step.label}</strong>
                  <span className="stepProgress" aria-label={`${step.label} ${formatStepMeta(step)}`}>
                    <span style={{ width: `${Math.round((step.progress || 0) * 100)}%` }} />
                  </span>
                </div>
                <small>{formatStepMeta(step)}</small>
              </div>
            ))}
          </div>
          {job?.status === "failed" ? <p className="error"><AlertTriangle size={16} />{job.error}</p> : null}
        </div>
      </section>

      {complete ? (
        <section className="results">
          <div className="sectionTitle">
            <h2>Evidence Frames</h2>
            <span>{`${detections.length} selected`}</span>
          </div>

          {detections.length === 0 ? (
            <div className="empty"><CheckCircle2 size={28} />No visible damage candidates above the confidence threshold.</div>
          ) : null}

          <div className="cards">
            {detections.map((item, index) => (
              <article className="card" key={`${item.frameNumber}-${item.label}-${index}`}>
                <img src={item.imageUrl} alt={`${item.label} on ${item.location}`} />
                <div className="cardBody">
                  <div className="cardTop">
                    <h3>{item.label}</h3>
                    <span>{Math.round(item.confidence * 100)}%</span>
                  </div>
                  <p>{item.location} · {item.severity}</p>
                  <p className="evidence">{item.evidence}</p>
                  <small>{item.imageLabel || `Image ${index + 1}`} · Frame {item.frameNumber}</small>
                </div>
              </article>
            ))}
          </div>
          <div className="resultActions">
            <a href={`/outputs/jobs/${job.id}`} target="_blank" rel="noreferrer">
              <FolderOpen size={16} />
              Output folder
            </a>
          </div>
        </section>
      ) : null}

      <section className="report">
        <div className="sectionTitle">
          <h2>Damage Report</h2>
          <span>{report ? `${report.totalDamageItems} item${report.totalDamageItems === 1 ? "" : "s"}` : "Waiting for analysis"}</span>
        </div>

        {complete && report ? (
          <div className="reportSurface">
            <div className="reportHeader">
              <div>
                <p className="reportKicker">{report.sourceVideo || "Uploaded video"}</p>
                <h3>{report.summary?.headline || "Damage inspection complete."}</h3>
              </div>
              <div className="reportStats">
                <Stat label="Damage items" value={report.totalDamageItems} />
                <Stat label="Images tagged" value={report.imagesWithDamage} />
                <Stat label="Sampled" value={report.sampledFrames} />
              </div>
            </div>

            {report.items.length ? (
              <div className="reportTableWrap">
                <table className="reportTable">
                  <thead>
                    <tr>
                      <th>Image</th>
                      <th>Damage</th>
                      <th>Vehicle part</th>
                      <th>Severity</th>
                      <th>Confidence</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <a href={item.imageUrl} target="_blank" rel="noreferrer">{item.imageLabel}</a>
                          <small>Frame {item.frameNumber}</small>
                        </td>
                        <td>{item.damageTypeLabel}</td>
                        <td>{item.vehiclePart}</td>
                        <td>{item.severity}</td>
                        <td>{item.confidencePercent}%</td>
                        <td>{item.evidence || item.sentence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty"><CheckCircle2 size={28} />No visible damage candidates above the confidence threshold.</div>
            )}

            <div className="copyBlock">
              <div className="copyHeader">
                <span><Clipboard size={16} /> Copyable report</span>
                <button type="button" onClick={copyReport}>
                  <Copy size={16} />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre>{reportText}</pre>
            </div>
          </div>
        ) : (
          <div className="reportPlaceholder">
            <Hourglass size={48} strokeWidth={2.25} />
            <span>Final report appears here after the video inspection completes.</span>
          </div>
        )}
      </section>
    </main>
  );
}

function formatReportText(report) {
  const lines = [
    report.reportTitle || "Rental Car Damage Report",
    `Source video: ${report.sourceVideo || "uploaded video"}`,
    `Generated: ${report.generatedAt}`,
    `Model: ${report.model}`,
    `Sampled frames: ${report.sampledFrames}`,
    `Damage items: ${report.totalDamageItems}`,
    "",
    "Summary",
    report.summary?.headline || "",
    "",
    "Damage Items"
  ];

  if (!report.items?.length) {
    lines.push("No visible damage candidates were found above the confidence threshold.");
    return lines.join("\n");
  }

  report.items.forEach((item) => {
    lines.push(
      `${item.imageLabel}: ${item.damageTypeLabel} on the ${item.vehiclePart} (${item.severity}, ${item.confidencePercent}% confidence). Frame ${item.frameNumber}. ${item.evidence || item.sentence}`
    );
  });

  return lines.join("\n");
}

function uploadAnalysis(form, onUploadProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${api}/api/analyze`);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onUploadProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {
        reject(new Error("Upload returned an invalid response"));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || "Upload failed"));
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(form);
  });
}

function makeIdlePipeline() {
  return [
    { key: "extract", label: "Extract frames", status: "pending", detail: "Waiting for upload", progress: 0 },
    { key: "inspect", label: "Gemma 4 Inspection", status: "pending", detail: "Waiting for frames", progress: 0 },
    { key: "dedupe", label: "Deduplicate", status: "pending", detail: "Waiting for findings", progress: 0 },
    { key: "annotate", label: "Annotate images", status: "pending", detail: "Waiting for damage list", progress: 0 },
    { key: "report", label: "Build report", status: "pending", detail: "Waiting for annotations", progress: 0 }
  ];
}

function makeUploadPipeline(percent, status = "active") {
  const pipeline = makeIdlePipeline();
  return pipeline;
}

function makeUploadJob(percent) {
  return {
    status: "uploading",
    progress: Math.max(1, Math.min(4, Math.round(percent / 25))),
    message: `Uploading video (${percent}%)`,
    pipeline: makeUploadPipeline(percent)
  };
}

function formatStepMeta(step) {
  if (step.status === "complete") return step.elapsedMs ? formatDuration(step.elapsedMs) : "Done";
  if (step.status === "active") return Number.isFinite(step.progress) ? `${Math.round(step.progress * 100)}%` : "Running";
  if (step.status === "failed") return "Failed";
  return "Waiting";
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "";
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

createRoot(document.getElementById("root")).render(<App />);
