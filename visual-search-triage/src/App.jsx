import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CircleAlert,
  FolderOpen,
  Image as ImageIcon,
} from "lucide-react";
import "./styles.css";

const PROVIDERS = {
  gemini: { name: "GPUs", accent: "gpu" },
  openrouter: { name: "GPUs", accent: "gpu" },
  cerebras: { name: "Cerebras", accent: "cerebras" }
};
const PANEL_PROVIDERS = ["cerebras", "gemini"];

function App() {
  const [health, setHealth] = useState(null);
  const selectedFilesRef = useRef([]);
  const previewUrlsRef = useRef([]);
  const [fileSummary, setFileSummary] = useState({ count: 0, folderName: "", previews: [] });
  const [description, setDescription] = useState("Food");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState([]);
  const [results, setResults] = useState({ gemini: null, cerebras: null });
  const [winnerProvider, setWinnerProvider] = useState(null);
  const leftProvider = "openrouter";
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

  function handlePreviewWheel(event) {
    const strip = event.currentTarget;
    const canScrollHorizontally = strip.scrollWidth > strip.clientWidth;
    if (!canScrollHorizontally) return;

    const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const delta = horizontalIntent ? event.deltaX : event.deltaY;
    if (!delta) return;

    event.preventDefault();
    strip.scrollLeft += delta;
  }

  async function startRun() {
    setError("");
    setEvents([]);
    setResults({ gemini: null, cerebras: null });
    setWinnerProvider(null);
    setRunning(true);
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

      const source = new EventSource(`/api/runs/${data.runId}/events`);
      ["trace", "metric", "partial_result", "provider_done", "run_done", "error"].forEach((type) => {
        source.addEventListener(type, (event) => {
          const payload = JSON.parse(event.data);
          setEvents((current) => [...current, payload]);
          if (type === "provider_done") {
            const resultKey = payload.panelProvider || payload.provider;
            setResults((current) => ({ ...current, [resultKey]: payload }));
            if (isSuccessfulCompletion(payload)) {
              setWinnerProvider((current) => current || resultKey);
            }
          }
          if (type === "run_done") {
            setRunning(false);
            source.close();
          }
          if (type === "error") {
            const resultKey = payload.panelProvider || payload.provider;
            setResults((current) => resultKey in current ? { ...current, [resultKey]: { provider: payload.provider, panelProvider: payload.panelProvider, status: "failed", error: payload.message } } : current);
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
  const canStart = imageCount > 0 && description.trim() && !running;

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <div className="demo-badge"><img src="/assets/gemini-logo.png" alt="" /> Gemma 4 Demo</div>
          <h1>Image Search</h1>
          <p><strong>Find &amp; match images</strong> according to a description</p>
        </div>
        <div className="control-card">
          <div className="picker-field">
            <label className="field-label" htmlFor="folder-input">IMAGE FOLDER</label>
            <label className="folder-drop" htmlFor="folder-input">
              <FolderOpen size={30} />
              <span>{imageCount ? folderName : "coco"}</span>
              <strong>{imageCount ? `${imageCount} images ready` : "30 images ready"}</strong>
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
          </div>

          <div className="query-field">
            <label className="field-label" htmlFor="description">FIND IMAGES OF</label>
            <input
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Food"
            />
          </div>

          <button className="primary-button" disabled={!canStart} onClick={startRun}>
            Start image search
          </button>
          {error ? <div className="error-pill"><CircleAlert size={16} /> {error}</div> : null}
        </div>
      </section>

      <section className="agents-grid">
        {PANEL_PROVIDERS.map((provider) => (
          <AgentPanel
            key={provider}
            provider={provider}
            activeProvider={provider === "gemini" ? leftProvider : provider}
            health={health?.providers?.[provider === "gemini" ? leftProvider : provider]}
            events={events.filter((event) => (event.panelProvider || event.provider) === provider)}
            result={results[provider]}
            referenceMatches={provider === "cerebras" ? [] : results.cerebras?.matches || []}
            onMatchWheel={handlePreviewWheel}
            running={running}
            winnerProvider={winnerProvider}
            runStartedAt={runStartedAt}
            now={now}
          />
        ))}
      </section>
      <footer className="brand-footer"><img src="/assets/cerebras-logo.png" alt="" /><span>cerebras</span></footer>
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

function AgentPanel({ provider, activeProvider, health, events, result, referenceMatches, onMatchWheel, running, winnerProvider, runStartedAt, now }) {
  const config = PROVIDERS[activeProvider];
  const matches = sortMatchesForDisplay(result?.matches || [], referenceMatches);
  const status = result?.status || (running ? "running" : "idle");
  const finished = Boolean(result?.totalLatencyMs);
  const isWinner = winnerProvider === provider;
  const isLoser = Boolean(winnerProvider && finished && !isWinner);
  const elapsedMs = finished ? result.totalLatencyMs : running && runStartedAt ? now - runStartedAt : null;

  return (
    <article className={`agent-card ${config.accent} ${isWinner ? "winner" : ""} ${isLoser ? "loser" : ""} ${finished ? "finished" : ""}`}>
      <header>
        <h2>{config.name}</h2>
        <div className={`completion-time ${isWinner ? "winner-time" : isLoser ? "loser-time" : ""}`}>{elapsedMs === null ? "00:00" : formatTimer(elapsedMs)}</div>
      </header>

      <TraceWindow events={events} />

      <div className="results-box">
        <h3>All matches</h3>
        {result?.error ? <div className="panel-error">{result.error}</div> : null}
        {!result?.error && !matches.length ? <p className="empty-state">No matches returned yet.</p> : null}
        {matches.length ? (
          <div className="match-strip-shell">
            <div className="match-strip" onWheel={onMatchWheel} aria-label={`${config.name} matches`}>
              {matches.map((match) => (
                <figure className="match-tile" key={`${provider}-${match.filename}`} title={shortMatchDescription(match)}>
                  {match.imageUrl ? (
                    <img src={match.imageUrl} alt="" />
                  ) : (
                    <div className="match-thumb placeholder"><ImageIcon size={24} /></div>
                  )}
                  <figcaption>{fileExtension(match.filename)}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function sortMatchesForDisplay(matches, referenceMatches = []) {
  if (!referenceMatches.length) return [...matches];
  const referenceOrder = new Map(referenceMatches.map((match, index) => [String(match.filename || ""), index]));
  return [...matches].sort((a, b) => {
    const aReference = referenceOrder.get(String(a.filename || ""));
    const bReference = referenceOrder.get(String(b.filename || ""));
    const aHasReference = aReference !== undefined;
    const bHasReference = bReference !== undefined;
    if (aHasReference && bHasReference) return aReference - bReference;
    if (aHasReference) return -1;
    if (bHasReference) return 1;
    return Number(a.rank || 0) - Number(b.rank || 0);
  });
}

function shortMatchDescription(match) {
  const text = String(match.why_match || match.visible_evidence || "").replace(/\s+/g, " ").trim();
  const limit = 68;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

function fileExtension(filename) {
  const match = String(filename || "").match(/\.[a-z0-9]+$/i);
  return match ? match[0] : ".jpg";
}

function formatTimer(ms) {
  const safeMs = Math.max(0, Math.round(ms));
  const seconds = Math.floor(safeMs / 1000);
  const milliseconds = String(safeMs % 1000).padStart(3, "0").slice(1);
  return `${String(seconds).padStart(2, "0")}:${milliseconds}`;
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
          <pre>{formatTraceMessage(event)}</pre>
        </div>
      )) : <div className="trace-placeholder">Waiting for agent trace...</div>}
    </div>
  );
}

function formatTraceMessage(event) {
  const raw = event.message || summarizeEvent(event);
  if ((event.panelProvider || event.provider) !== "gemini") return raw;
  return String(raw)
    .replaceAll("OpenRouter", "GPU")
    .replaceAll("openrouter", "gpu")
    .replaceAll("api.openrouter.ai", "gpu.endpoint")
    .replaceAll("$OPENROUTER_API_KEY", "$GPU_API_KEY");
}

function summarizeEvent(event) {
  if (event.type === "partial_result") return `batch ${event.batch}: ${(event.matches || []).length} matches in ${event.latencyMs}ms`;
  if (event.type === "provider_done") return `${event.status}: ${(event.matches || []).length} matches`;
  if (event.type === "metric") return `${event.images || 0} images, ${event.batches || 0} batches`;
  if (event.type === "error") return event.message;
  return JSON.stringify(event);
}

createRoot(document.getElementById("root")).render(<App />);
