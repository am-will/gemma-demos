import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  X,
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

// Confetti palette chosen to read across the card's three zones:
// the orange header, the dark terminal trace, and the white results box.
const CONFETTI_COLORS = ["#ffffff", "#ffd23f", "#5ce6a5", "#36c5ff", "#ff5fa2", "#bb8bff", "#fff0bf"];
const CONFETTI_SHAPES = ["rect", "rect", "rect", "circle", "ribbon"];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// One radial pop: pieces shoot out from a single point in every direction,
// then fall with gravity and tumble. `baseDelay` staggers the three explosions.
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

// Zones spread across the whole card (top row + bottom row over the matched
// images) so the explosions cover the full container instead of clustering.
const BURST_ZONES = [
  { x: [10, 34], y: [10, 30] },
  { x: [40, 62], y: [8, 26] },
  { x: [66, 90], y: [12, 32] },
  { x: [12, 36], y: [54, 80] },
  { x: [42, 64], y: [58, 84] },
  { x: [66, 90], y: [52, 78] }
];

const inZone = ([min, max]) => min + Math.random() * (max - min);

// One explosion per zone, fired in quick succession. Regenerated on every
// celebration (positions + pieces) so it never looks canned.
function createBursts() {
  return BURST_ZONES.map((zone, id) => ({
    id,
    left: `${inZone(zone.x).toFixed(1)}%`,
    top: `${inZone(zone.y).toFixed(1)}%`,
    pieces: createBurstPieces(id * 95 + Math.round(Math.random() * 70))
  }));
}

function App() {
  const [health, setHealth] = useState(null);
  const selectedFilesRef = useRef([]);
  const previewUrlsRef = useRef([]);
  const activeRunRef = useRef(null);
  const eventSourceRef = useRef(null);
  const [fileSummary, setFileSummary] = useState({ count: 0, folderName: "", previews: [] });
  const [folderDragActive, setFolderDragActive] = useState(false);
  const [description, setDescription] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState([]);
  const [results, setResults] = useState({ gemini: null, cerebras: null });
  const [winnerProvider, setWinnerProvider] = useState(null);
  const leftProvider = "openrouter";
  const [providerStartedAt, setProviderStartedAt] = useState({});
  const [frozenElapsedMs, setFrozenElapsedMs] = useState({});
  const [previewState, setPreviewState] = useState(null);
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

  useEffect(() => {
    if (!previewState) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setPreviewState(null);
      if (event.key === "ArrowLeft") stepPreview(-1);
      if (event.key === "ArrowRight") stepPreview(1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewState]);

  function applySelectedFiles(files) {
    setError("");
    revokePreviewUrls();
    const selected = files.filter(isImageFile);
    selectedFilesRef.current = selected;
    const previews = selected.slice(0, 36).map((file) => {
      const url = URL.createObjectURL(file);
      previewUrlsRef.current.push(url);
      return {
        name: file.webkitRelativePath || file.relativePath || file.name,
        url
      };
    });
    setFileSummary({ count: selected.length, folderName: "", previews });
    if (!selected.length) setError("That folder did not include browser-readable image files.");
  }

  function handleFolderChange(event) {
    applySelectedFiles(Array.from(event.target.files || []));
  }

  function handleFolderDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setFolderDragActive(true);
  }

  function handleFolderDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) setFolderDragActive(false);
  }

  async function handleFolderDrop(event) {
    event.preventDefault();
    setFolderDragActive(false);
    try {
      applySelectedFiles(await getDroppedFiles(event.dataTransfer));
    } catch (err) {
      setError(err.message || "Could not read the dropped folder.");
    }
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
    setProviderStartedAt({});
    setFrozenElapsedMs({});
    setRunning(true);
    const startedAt = Date.now();
    setNow(startedAt);

    try {
      const form = new FormData();
      form.append("description", description);
      form.append("leftProvider", leftProvider);
      for (const file of selectedFilesRef.current) form.append("images", file, file.webkitRelativePath || file.relativePath || file.name);
      const response = await fetch("/api/runs", { method: "POST", body: form });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

      activeRunRef.current = data.runId;
      const source = new EventSource(`/api/runs/${data.runId}/events`);
      eventSourceRef.current = source;
      ["trace", "metric", "partial_result", "provider_done", "run_done", "error"].forEach((type) => {
        source.addEventListener(type, (event) => {
          const payload = JSON.parse(event.data);
          setEvents((current) => [...current, payload]);
          if (type === "trace" && payload.phase === "dispatch") {
            const resultKey = payload.panelProvider || payload.provider;
            if (resultKey in results) {
              setProviderStartedAt((current) => current[resultKey] ? current : { ...current, [resultKey]: Date.now() });
            }
          }
          if (type === "partial_result") {
            const resultKey = payload.panelProvider || payload.provider;
            setResults((current) => ({ ...current, [resultKey]: mergePartialResult(current[resultKey], payload) }));
          }
          if (type === "provider_done") {
            const resultKey = payload.panelProvider || payload.provider;
            setResults((current) => ({ ...current, [resultKey]: payload }));
            if (isSuccessfulCompletion(payload)) {
              setWinnerProvider((current) => current || resultKey);
            }
          }
          if (type === "run_done") {
            setRunning(false);
            activeRunRef.current = null;
            eventSourceRef.current = null;
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
        activeRunRef.current = null;
        eventSourceRef.current = null;
        source.close();
      };
    } catch (err) {
      setError(err.message);
      setRunning(false);
      activeRunRef.current = null;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    }
  }

  async function stopRun() {
    const runId = activeRunRef.current;
    activeRunRef.current = null;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    const stoppedAt = Date.now();
    setFrozenElapsedMs(Object.fromEntries(PANEL_PROVIDERS.map((provider) => [
      provider,
      providerStartedAt[provider] ? Math.max(0, stoppedAt - providerStartedAt[provider]) : null
    ])));
    setRunning(false);
    setEvents((current) => [...current, { type: "trace", at: new Date().toISOString(), provider: "system", phase: "cancel", message: "Stop requested. Canceling active provider calls." }]);

    if (!runId) return;
    try {
      const response = await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
      if (!response.ok) {
        const data = await readJsonResponse(response);
        throw new Error(data.error || `HTTP ${response.status}`);
      }
    } catch (err) {
      setError(err.message || "Could not stop run.");
    }
  }

  function openPreview(provider, matches, index) {
    setPreviewState({ provider, matches, index });
  }

  function stepPreview(direction) {
    setPreviewState((current) => {
      if (!current?.matches?.length) return current;
      const nextIndex = (current.index + direction + current.matches.length) % current.matches.length;
      return { ...current, index: nextIndex };
    });
  }

  const imageCount = fileSummary.count;
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
            <label
              className={`folder-drop ${imageCount ? "loaded" : "empty"} ${folderDragActive ? "drag-active" : ""}`}
              htmlFor="folder-input"
              onDragOver={handleFolderDragOver}
              onDragLeave={handleFolderDragLeave}
              onDrop={handleFolderDrop}
            >
              <FolderOpen size={30} />
              {imageCount ? <strong>{imageCount} images</strong> : null}
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
              placeholder="Prompt"
            />
          </div>

          <button className={`primary-button ${running ? "stop-button" : ""}`} disabled={!running && !canStart} onClick={running ? stopRun : startRun}>
            {running ? "Stop image search" : "Start image search"}
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
            providerStartedAt={providerStartedAt[provider]}
            frozenElapsedMs={frozenElapsedMs[provider]}
            onPreviewMatch={openPreview}
            now={now}
          />
        ))}
      </section>
      <ImagePreviewModal previewState={previewState} onClose={() => setPreviewState(null)} onStep={stepPreview} />
      <footer className="brand-footer"><img src="/assets/cerebras-wordmark.png" alt="Cerebras" /></footer>
    </main>
  );
}

function isImageFile(file) {
  if (file.type?.startsWith("image/")) return true;
  return /\.(avif|gif|jpe?g|png|webp)$/i.test(file.name || "");
}

async function getDroppedFiles(dataTransfer) {
  const entries = Array.from(dataTransfer.items || [])
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean);

  if (!entries.length) return Array.from(dataTransfer.files || []);

  const files = [];
  await Promise.all(entries.map((entry) => readDroppedEntry(entry, "", files)));
  return files;
}

async function readDroppedEntry(entry, path, files) {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    try {
      Object.defineProperty(file, "relativePath", { value: `${path}${file.name}` });
    } catch {
      file.relativePath = `${path}${file.name}`;
    }
    files.push(file);
    return;
  }

  if (!entry.isDirectory) return;
  const reader = entry.createReader();
  let batch = [];
  do {
    batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    await Promise.all(batch.map((child) => readDroppedEntry(child, `${path}${entry.name}/`, files)));
  } while (batch.length);
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

function mergePartialResult(currentResult, payload) {
  if (currentResult?.status === "complete") return currentResult;

  const matchesByFile = new Map();
  for (const match of currentResult?.matches || []) {
    matchesByFile.set(String(match.filename || ""), match);
  }
  for (const match of payload.matches || []) {
    matchesByFile.set(String(match.filename || ""), match);
  }

  return {
    ...currentResult,
    provider: payload.provider,
    panelProvider: payload.panelProvider,
    providerRoute: payload.providerRoute,
    status: "running",
    partial: true,
    batchesSeen: payload.batch,
    lastLatencyMs: payload.latencyMs,
    matches: Array.from(matchesByFile.values())
  };
}

function AgentPanel({ provider, activeProvider, health, events, result, referenceMatches, onMatchWheel, running, winnerProvider, providerStartedAt, frozenElapsedMs, onPreviewMatch, now }) {
  const config = PROVIDERS[activeProvider];
  const matches = sortMatchesForDisplay(result?.matches || [], referenceMatches);
  const status = result?.status || (running ? "running" : "idle");
  const finished = Boolean(result?.totalLatencyMs);
  const isWinner = winnerProvider === provider;
  const isLoser = Boolean(winnerProvider && finished && !isWinner);
  const isCerebras = provider === "cerebras";
  const elapsedMs = finished ? result.totalLatencyMs : running && providerStartedAt ? now - providerStartedAt : frozenElapsedMs ?? null;

  // The Cerebras panel celebrates the moment its timer lands. We mount the
  // overlay only for the duration of the animation so nothing keeps spinning
  // off-screen, and it re-fires fresh on every new run.
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (!isCerebras || !finished) {
      setCelebrate(false);
      return undefined;
    }
    setCelebrate(true);
    const timeout = setTimeout(() => setCelebrate(false), 3200);
    return () => clearTimeout(timeout);
  }, [isCerebras, finished]);

  return (
    <article className={`agent-card ${config.accent} ${isWinner ? "winner" : ""} ${isLoser ? "loser" : ""} ${finished ? "finished" : ""} ${celebrate ? "celebrating" : ""}`}>
      {celebrate ? <CerebrasCelebration /> : null}
      <div className="agent-top">
        <header>
          <h2>{config.name}</h2>
          <div className={`completion-time ${isWinner ? "winner-time" : isLoser ? "loser-time" : ""}`}>{elapsedMs === null ? "00:00.000" : formatTimer(elapsedMs)}</div>
        </header>

        <TraceWindow events={events} />
      </div>

      <div className="results-box">
        <h3>{matches.length} Matches</h3>
        {result?.error ? <div className="panel-error">{result.error}</div> : null}
        {!result?.error && !matches.length ? <p className="empty-state">No matches returned yet.</p> : null}
        {matches.length ? (
          <div className="match-strip-shell">
            <div className="match-strip" onWheel={onMatchWheel} aria-label={`${config.name} matches`}>
              {matches.map((match, index) => (
                <button className="match-tile" type="button" key={`${provider}-${match.filename}`} title={shortMatchDescription(match)} onClick={() => onPreviewMatch(provider, matches, index)}>
                  {match.imageUrl ? (
                    <img src={match.imageUrl} alt="" />
                  ) : (
                    <div className="match-thumb placeholder"><ImageIcon size={24} /></div>
                  )}
                  <span>{fileExtension(match.filename)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
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

function ImagePreviewModal({ previewState, onClose, onStep }) {
  if (!previewState?.matches?.length) return null;

  const match = previewState.matches[previewState.index];
  const label = `${previewState.index + 1} / ${previewState.matches.length}`;
  const description = shortMatchDescription(match);

  return (
    <div className="preview-backdrop" role="dialog" aria-modal="true" aria-label="Image preview" onMouseDown={onClose}>
      <div className={`preview-frame ${previewState.provider === "cerebras" ? "cerebras" : "gpu"}`} onMouseDown={(event) => event.stopPropagation()}>
        <button className="preview-close" type="button" onClick={onClose} aria-label="Close preview"><X size={22} /></button>
        <button className="preview-arrow previous" type="button" onClick={() => onStep(-1)} aria-label="Previous image"><ChevronLeft size={34} /></button>
        <div className="preview-image-wrap">
          {match.imageUrl ? <img src={match.imageUrl} alt="" /> : <div className="preview-placeholder"><ImageIcon size={44} /></div>}
        </div>
        <button className="preview-arrow next" type="button" onClick={() => onStep(1)} aria-label="Next image"><ChevronRight size={34} /></button>
        <div className="preview-meta">
          <strong>{match.filename || "Image"}</strong>
          <span>{label}</span>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
    </div>
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
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const milliseconds = safeMs % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function TraceWindow({ events, compact = false }) {
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
  const displayText = String(raw).replaceAll("-trial", "");
  if ((event.panelProvider || event.provider) !== "gemini") return displayText;
  return displayText
    .replaceAll("OpenRouter", "GPU")
    .replaceAll("openrouter", "gpu")
    .replaceAll(":free", "")
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
