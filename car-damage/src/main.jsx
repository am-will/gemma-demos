import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, CheckCircle2, Film, Gauge, Image as ImageIcon, UploadCloud } from "lucide-react";
import "./styles.css";

const api = "";
const PANEL_PROVIDERS = ["gpu", "cerebras"];
const PROVIDERS = {
  gpu: { name: "GPU", accent: "gpu" },
  cerebras: { name: "Cerebras", accent: "cerebras" }
};

function App() {
  const [health, setHealth] = useState(null);
  const [file, setFile] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [events, setEvents] = useState([]);
  const [results, setResults] = useState({ gpu: null, cerebras: null });
  const [winnerProvider, setWinnerProvider] = useState(null);
  const [runStartedAt, setRunStartedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [settings, setSettings] = useState({ sampleFps: 0.5, maxFrames: 20, confidenceFloor: 0.35, frameConcurrency: 4, tileConcurrency: 3 });
  const [previewUrl, setPreviewUrl] = useState("");
  const inputRef = useRef(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    fetch(`${api}/api/health`)
      .then(readJsonResponse)
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => () => eventSourceRef.current?.close(), []);

  useEffect(() => {
    if (!jobId) return undefined;
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${api}/api/jobs/${jobId}`);
        const data = await readJsonResponse(response);
        setJob(data);
        if (data.result?.providers) {
          setResults((current) => ({ ...current, ...data.result.providers }));
        }
        if (["complete", "failed"].includes(data.status)) clearInterval(interval);
      } catch (pollError) {
        setError(pollError.message);
      }
    }, 800);
    return () => clearInterval(interval);
  }, [jobId]);

  useEffect(() => {
    const running = job?.status === "inspecting";
    if (!running) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 47);
    return () => window.clearInterval(timer);
  }, [job?.status]);

  const extractionReady = job?.status === "extracted";
  const uploadingOrExtracting = job && ["uploading", "queued", "processing"].includes(job.status);
  const inspecting = job?.status === "inspecting";
  const complete = job?.status === "complete";
  const canRun = Boolean(jobId && extractionReady && !inspecting);
  const statusTone = job?.status === "failed" ? "bad" : complete ? "good" : uploadingOrExtracting || inspecting ? "active" : "idle";
  const frameCount = job?.internalFrameCount || job?.settings?.maxFrames || settings.maxFrames;

  async function startExtraction(selectedFile = file) {
    if (!selectedFile || uploadingOrExtracting || inspecting) return;
    eventSourceRef.current?.close();
    setError("");
    setEvents([]);
    setResults({ gpu: null, cerebras: null });
    setWinnerProvider(null);
    setRunStartedAt(null);
    setJob(makeUploadJob(0));
    setJobId(null);

    const form = new FormData();
    form.append("video", selectedFile);
    form.append("sampleFps", settings.sampleFps);
    form.append("maxFrames", settings.maxFrames);
    form.append("confidenceFloor", settings.confidenceFloor);
    form.append("frameConcurrency", settings.frameConcurrency);
    form.append("tileConcurrency", settings.tileConcurrency);

    try {
      const data = await uploadAnalysis(form, (percent) => setJob(makeUploadJob(percent)));
      setJobId(data.jobId);
      setJob({ status: "queued", progress: 3, message: "Preparing frames", pipeline: makeUploadPipeline(100, "complete"), providerRuns: makeIdleProviderRuns() });
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Upload failed";
      setError(message);
      setJob({ status: "failed", progress: 0, message, pipeline: makeUploadPipeline(0, "failed"), providerRuns: makeIdleProviderRuns() });
    }
  }

  async function startInspection() {
    if (!canRun) return;
    setError("");
    setEvents([]);
    setResults({ gpu: null, cerebras: null });
    setWinnerProvider(null);
    const startedAt = Date.now();
    setRunStartedAt(startedAt);
    setNow(startedAt);

    try {
      await continueAnalysis(jobId);
      openEventStream(jobId);
      setJob((current) => ({
        ...current,
        status: "inspecting",
        progress: Math.max(current?.progress || 0, 20),
        message: "Running GPU and Cerebras comparison"
      }));
    } catch (inspectionError) {
      const message = inspectionError instanceof Error ? inspectionError.message : "Inspection failed";
      setError(message);
    }
  }

  function openEventStream(nextJobId) {
    eventSourceRef.current?.close();
    const source = new EventSource(`${api}/api/jobs/${nextJobId}/events`);
    eventSourceRef.current = source;
    ["trace", "partial_result", "provider_done", "run_done", "error"].forEach((type) => {
      source.addEventListener(type, (event) => {
        const payload = sanitizeEventPayload(JSON.parse(event.data));
        setEvents((current) => [...current, payload]);
        if (type === "provider_done") {
          setResults((current) => ({ ...current, [payload.provider]: payload }));
          if (payload.status === "complete" && Number.isFinite(payload.totalLatencyMs)) {
            setWinnerProvider((current) => current || payload.provider);
          }
        }
        if (type === "error") {
          setResults((current) => payload.provider in current ? { ...current, [payload.provider]: { provider: payload.provider, status: "failed", error: payload.message } } : current);
        }
        if (type === "run_done") {
          source.close();
        }
      });
    });
    source.onerror = () => {
      setEvents((current) => [...current, { type: "error", at: new Date().toISOString(), provider: "system", message: "Trace stream disconnected." }]);
      source.close();
    };
  }

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    if (selectedFile) startExtraction(selectedFile);
  }

  function cuePreviewFrame(event) {
    const video = event.currentTarget;
    try {
      video.currentTime = Math.min(0.1, Math.max(0, video.duration || 0));
    } catch {
      // Metadata seeking is best-effort while the preview loads.
    }
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <div className="demo-badge"><Gauge size={26} /> Gemma 4 Demo</div>
          <h1>Damage Scout</h1>
          <p><strong>Compare car damage inspection</strong> across GPU and Cerebras</p>
        </div>

        <div className="control-card">
          <div className="picker-field">
            <label className="field-label" htmlFor="video-input">WALKAROUND VIDEO</label>
            <button className={`video-drop ${previewUrl ? "loaded" : "empty"}`} onClick={() => inputRef.current?.click()} type="button">
              {previewUrl ? (
                <video
                  className="video-preview"
                  src={previewUrl}
                  muted
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={cuePreviewFrame}
                  onLoadedData={(event) => event.currentTarget.pause()}
                />
              ) : null}
              <span className="drop-overlay">
                <UploadCloud size={36} />
                <strong>{file ? file.name : "Choose video"}</strong>
                <span>{file ? formatBytes(file.size) : "MP4, MOV, or WebM"}</span>
              </span>
            </button>
            <input ref={inputRef} id="video-input" className="hidden-input" type="file" accept="video/*" onChange={handleFileChange} />
          </div>

          <div className="settings-field">
            <label className="field-label">FRAME PREP</label>
            <div className="settings-grid">
              <NumberField label="FPS" min="0.2" max="3" step="0.2" value={settings.sampleFps} onChange={(value) => setSettings({ ...settings, sampleFps: value })} />
              <NumberField label="Frames" min="1" max="80" value={settings.maxFrames} onChange={(value) => setSettings({ ...settings, maxFrames: value })} />
              <NumberField label="Confidence" min="0" max="1" step="0.05" value={settings.confidenceFloor} onChange={(value) => setSettings({ ...settings, confidenceFloor: value })} />
            </div>
            <div className={`status-pill ${statusTone}`}>
              <Film size={18} />
              <span>{job?.message || "Upload starts frame extraction"}</span>
            </div>
          </div>

          <button className="primary-button" disabled={!canRun} onClick={startInspection} type="button">
            {inspecting ? "Running comparison" : extractionReady ? "Run damage comparison" : uploadingOrExtracting ? "Extracting frames" : "Upload video first"}
          </button>
          {error ? <div className="error-pill"><AlertTriangle size={16} /> {error}</div> : null}
        </div>
      </section>

      <section className="prep-strip">
        <div className="prep-meter">
          <span>{job?.status || "idle"}</span>
          <strong>{job?.progress || 0}%</strong>
          <i style={{ width: `${job?.progress || 0}%` }} />
        </div>
        <p>{extractionReady ? "Frames are ready. Run will go straight to the AI model calls." : `Preparing up to ${frameCount} sampled frames before comparison.`}</p>
      </section>

      <section className="agents-grid">
        {PANEL_PROVIDERS.map((provider) => (
          <AgentPanel
            key={provider}
            provider={provider}
            health={health?.providers?.[provider]}
            events={events.filter((event) => event.provider === provider)}
            result={results[provider] || job?.result?.providers?.[provider]}
            runState={job?.providerRuns?.[provider]}
            running={inspecting}
            winnerProvider={winnerProvider}
            runStartedAt={runStartedAt}
            now={now}
          />
        ))}
      </section>
      <footer className="brand-footer">Cerebras</footer>
    </main>
  );
}

function AgentPanel({ provider, health, events, result, runState, running, winnerProvider, runStartedAt, now }) {
  const config = PROVIDERS[provider];
  const detections = (result?.detections || []).slice(0, 6);
  const totalDetections = result?.detections?.length || 0;
  const finished = Boolean(result?.totalLatencyMs);
  const isWinner = winnerProvider === provider;
  const isLoser = Boolean(winnerProvider && finished && !isWinner);
  const elapsedMs = finished ? result.totalLatencyMs : running && runStartedAt ? now - runStartedAt : null;
  const status = result?.status || runState?.status || (running ? "running" : "idle");

  return (
    <article className={`agent-card ${config.accent} ${isWinner ? "winner" : ""} ${isLoser ? "loser" : ""} ${finished ? "finished" : ""}`}>
      <div className="agent-top">
        <header>
          <div>
            <h2>{config.name}</h2>
            <span>{sanitizeTraceText(health?.model || runState?.model || "gemma-4")}</span>
          </div>
          <div className={`completion-time ${isWinner ? "winner-time" : isLoser ? "loser-time" : ""}`}>{elapsedMs === null ? "00:00.000" : formatTimer(elapsedMs)}</div>
        </header>
        <TraceWindow events={events} />
      </div>

      <div className="results-box">
        <div className="results-heading">
          <h3>{totalDetections} Evidence Frame{totalDetections === 1 ? "" : "s"}</h3>
          <span>{status}</span>
        </div>
        {result?.error ? <div className="panel-error">{sanitizeTraceText(result.error)}</div> : null}
        {!result?.error && !detections.length ? (
          <p className="empty-state">{finished ? "No visible damage candidates above threshold." : "Annotated damage thumbnails appear here."}</p>
        ) : null}
        {detections.length ? (
          <div className="evidence-grid">
            {detections.map((item, index) => (
              <a className="evidence-tile" href={item.imageUrl} target="_blank" rel="noreferrer" key={`${provider}-${item.imageUrl || index}`}>
                {item.imageUrl ? <img src={item.imageUrl} alt={`${item.label} on ${item.location}`} /> : <span className="image-placeholder"><ImageIcon size={24} /></span>}
                <figcaption>
                  <strong>{item.label || "damage"}</strong>
                  <span>{Math.round(Number(item.confidence || 0) * 100)}% · Frame {item.frameNumber}</span>
                </figcaption>
              </a>
            ))}
          </div>
        ) : null}
        {totalDetections > detections.length ? <p className="more-results">Showing 6 of {totalDetections}. Full manifest is in the job output.</p> : null}
      </div>
    </article>
  );
}

function TraceWindow({ events }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const trace = ref.current;
    if (!trace) return undefined;
    const frame = window.requestAnimationFrame(() => {
      trace.scrollTop = trace.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [events.length]);

  return (
    <div className="trace-window" ref={ref}>
      {events.length ? events.map((event, index) => (
        <div className={`trace-line ${event.phase || event.type}`} key={`${event.at}-${index}`}>
          <span className="trace-time">{new Date(event.at).toLocaleTimeString()}</span>
          <span className="trace-phase">{event.phase || event.type}</span>
          <pre>{formatTraceMessage(event)}</pre>
        </div>
      )) : <div className="trace-placeholder">Waiting for agent trace...</div>}
    </div>
  );
}

function NumberField({ label, value, onChange, ...props }) {
  return (
    <label>
      <span>{label}</span>
      <input type="number" value={value} onChange={(event) => onChange(event.target.value)} {...props} />
    </label>
  );
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

async function continueAnalysis(jobId) {
  const response = await fetch(`${api}/api/jobs/${jobId}/inspect`, { method: "POST" });
  return readJsonResponse(response);
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) {
    if (!response.ok) throw new Error(`HTTP ${response.status}: empty response from server`);
    return {};
  }
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${response.status}: server returned non-JSON response`);
  }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function makeIdleProviderRuns() {
  return Object.fromEntries(PANEL_PROVIDERS.map((provider) => [provider, { provider, label: PROVIDERS[provider].name, status: "idle", model: "gemma-4" }]));
}

function makeUploadPipeline() {
  return [
    { key: "extract", label: "Extract frames", status: "active", detail: "Preparing frames", progress: 0 }
  ];
}

function makeUploadJob(percent) {
  return {
    status: "uploading",
    progress: Math.max(1, Math.min(4, Math.round(percent / 25))),
    message: `Uploading video (${percent}%)`,
    pipeline: makeUploadPipeline(),
    providerRuns: makeIdleProviderRuns()
  };
}

function sanitizeEventPayload(payload) {
  const copy = { ...payload };
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value === "string") copy[key] = sanitizeTraceText(value);
  }
  return copy;
}

function sanitizeTraceText(value) {
  return String(value || "")
    .replaceAll("OpenRouter", "GPU")
    .replaceAll("openrouter", "gpu")
    .replaceAll("api.openrouter.ai", "gpu.endpoint")
    .replaceAll("$OPENROUTER_API_KEY", "$GPU_API_KEY")
    .replace(/:free\b/gi, "")
    .replace(/\bfree\b/gi, "standard");
}

function formatTraceMessage(event) {
  if (event.type === "partial_result") return `${event.completed || 0} of ${event.total || 0} frames inspected`;
  if (event.type === "provider_done") return `${event.status}: ${(event.detections || []).length} evidence frames`;
  if (event.type === "error") return sanitizeTraceText(event.message);
  return sanitizeTraceText(event.message || JSON.stringify(event));
}

function formatTimer(ms) {
  const safeMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const milliseconds = safeMs % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

createRoot(document.getElementById("root")).render(<App />);
