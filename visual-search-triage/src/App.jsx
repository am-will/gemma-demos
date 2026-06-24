import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Bot,
  CircleAlert,
  Clock3,
  FolderOpen,
  Image as ImageIcon,
  Play,
  RefreshCw,
} from "lucide-react";
import "./styles.css";

const PROVIDERS = {
  gemini: { name: "Gemini Responses API", accent: "violet", logo: "/assets/gemini-logo.png" },
  openrouter: { name: "OpenRouter API", accent: "violet", logo: "/assets/gemini-logo.png" },
  cerebras: { name: "Cerebras API", accent: "pink", logo: "/assets/cerebras-logo.png" }
};
const PANEL_PROVIDERS = ["gemini", "cerebras"];

function App() {
  const [health, setHealth] = useState(null);
  const selectedFilesRef = useRef([]);
  const previewUrlsRef = useRef([]);
  const [fileSummary, setFileSummary] = useState({ count: 0, folderName: "", previews: [] });
  const [description, setDescription] = useState("red car with visible body damage");
  const [runId, setRunId] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState([]);
  const [results, setResults] = useState({ gemini: null, cerebras: null });
  const [winnerProvider, setWinnerProvider] = useState(null);
  const [manifestUrl, setManifestUrl] = useState("");
  const [leftProvider, setLeftProvider] = useState("gemini");
  const [runStartedAt, setRunStartedAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetch("/api/health")
      .then(readJsonResponse)
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => () => revokePreviewUrls(), []);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 47);
    return () => window.clearInterval(timer);
  }, [running]);

  function handleFolderChange(event) {
    setError("");
    revokePreviewUrls();
    const selected = Array.from(event.target.files || []).filter(isImageFile);
    selectedFilesRef.current = selected;
    const folderName = selected[0]?.webkitRelativePath?.split("/")?.[0] || "Selected images";
    const previews = selected.slice(0, 36).map((file) => {
      const url = URL.createObjectURL(file);
      previewUrlsRef.current.push(url);
      return {
        name: file.webkitRelativePath || file.name,
        url
      };
    });
    setFileSummary({ count: selected.length, folderName, previews });
    if (!selected.length) setError("That folder did not include browser-readable image files.");
  }

  function revokePreviewUrls() {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current = [];
  }

  async function startRun() {
    setError("");
    setEvents([]);
    setResults({ gemini: null, cerebras: null });
    setWinnerProvider(null);
    setManifestUrl("");
    setRunning(true);
    setRunId(null);
    const startedAt = Date.now();
    setRunStartedAt(startedAt);
    setNow(startedAt);

    try {
      const form = new FormData();
      form.append("description", description);
      form.append("leftProvider", leftProvider);
      for (const file of selectedFilesRef.current) form.append("images", file, file.webkitRelativePath || file.name);
      const response = await fetch("/api/runs", { method: "POST", body: form });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setRunId(data.runId);

      const source = new EventSource(`/api/runs/${data.runId}/events`);
      ["trace", "metric", "partial_result", "provider_done", "run_done", "error"].forEach((type) => {
        source.addEventListener(type, (event) => {
          const payload = JSON.parse(event.data);
          setEvents((current) => [...current, payload]);
          if (type === "provider_done") {
            setResults((current) => ({ ...current, [payload.provider]: payload }));
            if (isSuccessfulCompletion(payload)) {
              setWinnerProvider((current) => current || payload.provider);
            }
          }
          if (type === "run_done") {
            setManifestUrl(payload.manifestUrl || "");
            setRunning(false);
            source.close();
          }
          if (type === "error") {
            setResults((current) => payload.provider in current ? { ...current, [payload.provider]: { provider: payload.provider, status: "failed", error: payload.message } } : current);
          }
        });
      });
      source.onerror = () => {
        setEvents((current) => [...current, { type: "error", at: new Date().toISOString(), provider: "system", message: "Trace stream disconnected." }]);
        setRunning(false);
        source.close();
      };
    } catch (err) {
      setError(err.message);
      setRunning(false);
    }
  }

  const imageCount = fileSummary.count;
  const folderName = fileSummary.folderName || "Selected images";
  const previews = fileSummary.previews;
  const canStart = imageCount > 0 && description.trim() && !running;

  return (
    <main className="page-shell">
      <Decorations />
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><Bot size={18} /> side-by-side multimodal</div>
          <h1>Image Search</h1>
          <p>Find and match images according to your description, then compare how each API searches the same folder in real time.</p>
        </div>
        <div className="control-card">
          <label className="field-label" htmlFor="folder-input">Image folder</label>
          <label className="folder-drop" htmlFor="folder-input">
            <FolderOpen size={30} />
            <span>{imageCount ? folderName : "Choose a folder full of images"}</span>
            <strong>{imageCount ? `${imageCount} images ready` : "Folder picker"}</strong>
          </label>
          <input
            id="folder-input"
            className="hidden-input"
            type="file"
            accept="image/*"
            multiple
            webkitdirectory=""
            onChange={handleFolderChange}
          />

          <label className="field-label" htmlFor="description">Find images matching</label>
          <textarea
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Example: warehouse shelves with empty red bins"
          />

          <button className="primary-button" disabled={!canStart} onClick={startRun}>
            <Play size={20} /> Start both agents <span><ArrowRight size={18} /></span>
          </button>
          {error ? <div className="error-pill"><CircleAlert size={16} /> {error}</div> : null}
        </div>
      </section>

      {previews.length ? (
        <section className="image-strip" aria-label="Selected image previews">
          {previews.map((preview) => (
            <figure key={preview.url}>
              <img src={preview.url} alt="" />
              <figcaption>{preview.name}</figcaption>
            </figure>
          ))}
        </section>
      ) : null}

      <section className="agents-grid">
        {PANEL_PROVIDERS.map((provider) => (
          <AgentPanel
            key={provider}
            provider={provider}
            activeProvider={provider === "gemini" ? leftProvider : provider}
            leftProvider={leftProvider}
            onToggleLeftProvider={() => setLeftProvider((current) => current === "gemini" ? "openrouter" : "gemini")}
            health={health?.providers?.[provider === "gemini" ? leftProvider : provider]}
            events={events.filter((event) => event.provider === provider)}
            result={results[provider]}
            running={running}
            winnerProvider={winnerProvider}
            runStartedAt={runStartedAt}
            now={now}
          />
        ))}
      </section>

      {manifestUrl || runId ? (
        <div className="run-footer">
        {manifestUrl ? <a className="manifest-link" href={manifestUrl} target="_blank" rel="noreferrer">Open run manifest</a> : null}
        {runId ? <span className="run-id">Run {runId}</span> : null}
        </div>
      ) : null}
    </main>
  );
}

function isImageFile(file) {
  if (file.type?.startsWith("image/")) return true;
  return /\.(avif|gif|jpe?g|png|webp)$/i.test(file.name || "");
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) {
    if (!response.ok) throw new Error(`HTTP ${response.status}: empty response from server`);
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${response.status}: server returned non-JSON response`);
  }
}

function isSuccessfulCompletion(payload) {
  if (payload.status !== "complete" || !Number.isFinite(payload.totalLatencyMs)) return false;
  if (!Array.isArray(payload.batches)) return true;
  return payload.batches.some((batch) => !batch.error);
}

function AgentPanel({ provider, activeProvider, leftProvider, onToggleLeftProvider, health, events, result, running, winnerProvider, runStartedAt, now }) {
  const config = PROVIDERS[activeProvider];
  const matches = sortMatchesForDisplay(result?.matches || []);
  const status = result?.status || (running ? "running" : "idle");
  const finished = Boolean(result?.totalLatencyMs);
  const isWinner = winnerProvider === provider;
  const isLoser = Boolean(winnerProvider && finished && !isWinner);
  const elapsedMs = finished ? result.totalLatencyMs : running && runStartedAt ? now - runStartedAt : null;
  const canSwitch = provider === "gemini" && !running;

  return (
    <article className={`agent-card ${config.accent} ${isWinner ? "winner" : ""} ${isLoser ? "loser" : ""} ${finished ? "finished" : ""}`}>
      <header>
        <div className="agent-logo"><img src={config.logo} alt="" /></div>
        <div className="agent-title-block">
          <div className="agent-title-row">
            <div className="provider-copy" key={activeProvider}>
              <h2>{config.name}</h2>
              <p>{health?.model || "model not loaded"}</p>
            </div>
            {provider === "gemini" ? (
              <button className="provider-switch" type="button" onClick={onToggleLeftProvider} disabled={!canSwitch} title={leftProvider === "gemini" ? "Switch to OpenRouter API" : "Switch to Gemini Responses API"}>
                <RefreshCw size={18} />
              </button>
            ) : null}
          </div>
        </div>
        <StatusBadge status={status} />
      </header>

      <div className="agent-metrics">
        <Metric label="Time to Completion" value={elapsedMs === null ? "--" : formatTimer(elapsedMs)} icon={Clock3} variant={isWinner ? "winner-time" : isLoser ? "loser-time" : running ? "running-time" : ""} />
        <Metric label="Matches" value={String(matches.length)} icon={ImageIcon} />
      </div>

      <TraceWindow events={events} />

      <div className="results-box">
        <h3>All matches</h3>
        {result?.error ? <div className="panel-error">{result.error}</div> : null}
        {!result?.error && !matches.length ? <p className="empty-state">No matches returned yet.</p> : null}
        {matches.map((match) => (
          <div className="match-row" key={`${provider}-${match.filename}`}>
            {match.imageUrl ? (
              <img className="match-thumb" src={match.imageUrl} alt="" />
            ) : (
              <div className="match-thumb placeholder"><ImageIcon size={24} /></div>
            )}
            <div>
              <strong>{match.filename}</strong>
              <p>{shortMatchDescription(match)}</p>
            </div>
            <span>{Math.round((match.confidence || 0) * 100)}%</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function sortMatchesForDisplay(matches) {
  return [...matches].sort((a, b) => String(a.filename || "").localeCompare(String(b.filename || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  }));
}

function shortMatchDescription(match) {
  const text = String(match.why_match || match.visible_evidence || "").replace(/\s+/g, " ").trim();
  const limit = 68;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

function formatTimer(ms) {
  const safeMs = Math.max(0, Math.round(ms));
  const seconds = Math.floor(safeMs / 1000);
  const milliseconds = String(safeMs % 1000).padStart(3, "0");
  return `${seconds}:${milliseconds}`;
}

function Metric({ label, value, icon: Icon, variant = "" }) {
  return (
    <div className={`agent-metric ${variant}`}>
      <Icon size={16} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ status }) {
  return <div className={`status-badge ${status}`}>{status}</div>;
}

function TraceWindow({ events, compact = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length]);

  return (
    <div className={`trace-window ${compact ? "compact" : ""}`} ref={ref}>
      {events.length ? events.map((event, index) => (
        <div className={`trace-line ${event.phase || event.type}`} key={`${event.at}-${index}`}>
          <span className="trace-time">{new Date(event.at).toLocaleTimeString()}</span>
          <span className="trace-phase">{event.phase || event.type}</span>
          <pre>{event.message || summarizeEvent(event)}</pre>
        </div>
      )) : <div className="trace-placeholder">$ waiting for agent trace...</div>}
    </div>
  );
}

function summarizeEvent(event) {
  if (event.type === "partial_result") return `batch ${event.batch}: ${(event.matches || []).length} matches in ${event.latencyMs}ms`;
  if (event.type === "provider_done") return `${event.status}: ${(event.matches || []).length} matches`;
  if (event.type === "metric") return `${event.images || 0} images, ${event.batches || 0} batches`;
  if (event.type === "error") return event.message;
  return JSON.stringify(event);
}

function Decorations() {
  return (
    <div className="decorations" aria-hidden="true">
      <span className="shape circle" />
      <span className="shape triangle" />
      <span className="shape square" />
      <span className="shape pill" />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
