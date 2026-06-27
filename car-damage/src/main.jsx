import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, Image as ImageIcon, UploadCloud } from "lucide-react";
import "./styles.css";

const api = "";
const PANEL_PROVIDERS = ["cerebras", "gpu"];
const PROVIDERS = {
  cerebras: { name: "Cerebras", accent: "cerebras", logo: "/assets/cerebras-logo.png" },
  gpu: { name: "GPU", accent: "gpu", logo: "/assets/gemini-logo.png" }
};
const CONFETTI_COLORS = ["#ffffff", "#ffd23f", "#5ce6a5", "#36c5ff", "#ff5fa2", "#bb8bff", "#fff0bf"];
const CONFETTI_SHAPES = ["rect", "rect", "rect", "circle", "ribbon"];
const BURST_ZONES = [
  { x: [10, 34], y: [10, 30] },
  { x: [40, 62], y: [8, 26] },
  { x: [66, 90], y: [12, 32] },
  { x: [12, 36], y: [54, 80] },
  { x: [42, 64], y: [58, 84] },
  { x: [66, 90], y: [52, 78] }
];

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
  const canRun = Boolean(jobId && extractionReady && !inspecting);

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
          <div className="demo-badge"><img src="/assets/gemini-logo.png" alt="" /> Gemma 4 Demo</div>
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

          <button className={`primary-button ${extractionReady ? "ready" : ""}`} disabled={!canRun} onClick={startInspection} type="button">
            {inspecting ? "Checking for damage" : extractionReady ? "Check for damage" : uploadingOrExtracting ? "Preparing frames" : "Upload video first"}
          </button>
          {error ? <div className="error-pill"><AlertTriangle size={16} /> {error}</div> : null}
        </div>
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
      <footer className="brand-footer"><img src="/assets/cerebras-wordmark.png" alt="Cerebras" /></footer>
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
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (provider !== "cerebras" || !finished) {
      setCelebrate(false);
      return undefined;
    }
    setCelebrate(true);
    const timeout = setTimeout(() => setCelebrate(false), 3200);
    return () => clearTimeout(timeout);
  }, [provider, finished]);

  return (
    <article className={`agent-card ${config.accent} ${isWinner ? "winner" : ""} ${isLoser ? "loser" : ""} ${finished ? "finished" : ""} ${celebrate ? "celebrating" : ""}`}>
      {celebrate ? <CerebrasCelebration /> : null}
      <div className="agent-top">
        <header>
          <div>
            <h2><img src={config.logo} alt="" /> {config.name}</h2>
            <span>{sanitizeTraceText(health?.model || runState?.model || "gemma-4")}</span>
          </div>
          <div className={`completion-time ${isWinner ? "winner-time" : isLoser ? "loser-time" : ""}`}>{elapsedMs === null ? "00:00.000" : formatTimer(elapsedMs)}</div>
        </header>
        <TraceWindow events={events} />
      </div>

      <div className="results-box">
        <div className="results-heading">
          <h3>{totalDetections} Evidence Frame{totalDetections === 1 ? "" : "s"}</h3>
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

function CerebrasCelebration() {
  const burstsRef = useRef(null);
  if (!burstsRef.current) burstsRef.current = createBursts();

  return (
    <div className="celebration" aria-hidden="true">
      {burstsRef.current.map((burst) => (
        <div className="confetti-burst" key={burst.id} style={{ left: burst.left, top: burst.top }}>
          {burst.pieces.map((piece) => (
            <span key={piece.id} className="confetti-piece" style={piece.style}>
              <i className={`confetti-shape ${piece.shape}`} style={{ "--color": piece.color }} />
            </span>
          ))}
        </div>
      ))}
    </div>
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
    .replaceAll("Google AI Studio", "GPU provider")
    .replaceAll("googleapis.com", "gpu.provider")
    .replaceAll("ai.google.dev", "gpu.provider")
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

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function createBurstPieces(baseDelay) {
  const count = 14 + Math.floor(Math.random() * 5);
  return Array.from({ length: count }, (_, id) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 2.6 + Math.random() * 5;
    const burstX = Math.cos(angle) * distance;
    const burstY = Math.sin(angle) * distance - 1.2;
    const fallX = burstX + (Math.random() - 0.5) * 2.5;
    const fallY = burstY + 6 + Math.random() * 9;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (220 + Math.random() * 560);
    const size = 0.38 + Math.random() * 0.4;
    return {
      id,
      shape: pick(CONFETTI_SHAPES),
      color: pick(CONFETTI_COLORS),
      style: {
        "--bx": `${burstX.toFixed(2)}rem`,
        "--by": `${burstY.toFixed(2)}rem`,
        "--fx": `${fallX.toFixed(2)}rem`,
        "--fy": `${fallY.toFixed(2)}rem`,
        "--spin": `${Math.round(spin)}deg`,
        "--size": `${size.toFixed(2)}rem`,
        "--delay": `${baseDelay + Math.round(Math.random() * 70)}ms`,
        "--dur": `${Math.round(1100 + Math.random() * 650)}ms`,
        "--flutter": `${Math.round(320 + Math.random() * 500)}ms`
      }
    };
  });
}

function inZone([min, max]) {
  return min + Math.random() * (max - min);
}

function createBursts() {
  return BURST_ZONES.map((zone, id) => ({
    id,
    left: `${inZone(zone.x).toFixed(1)}%`,
    top: `${inZone(zone.y).toFixed(1)}%`,
    pieces: createBurstPieces(id * 95 + Math.round(Math.random() * 70))
  }));
}

createRoot(document.getElementById("root")).render(<App />);
