import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../shared/quant-base.css";
import { PromptIntro } from "../../shared/PromptIntro.jsx";
import "./qwen-earnings-compare.css";

const DEFAULT_CHALLENGE = "Product revenue grew 32%, well above the prior guide. Is that enough evidence to underwrite 30% growth from here?";
const CONCLUSION_QUESTION = "Does the product-revenue growth represent a durable new run rate?";
const INTRO_PROMPT = "Analyze the earnings report and call transcript to determine whether product-revenue growth represents a durable new run rate or a temporary acceleration.";
const INTRO_ATTACHMENTS = [
  { src: "/api/example/deck/13", alt: "Financial highlights page" },
  { src: "/api/example/deck/25", alt: "Forward guidance page" },
  { src: "/api/example/transcript/14", alt: "Analyst questions page" }
];

const EVIDENCE = {
  kpi: { document: "deck", page: 13, label: "Financial highlights" },
  growth: { document: "deck", page: 16, label: "Growth trend" },
  rpo: { document: "deck", page: 17, label: "Remaining obligations" },
  nrr: { document: "deck", page: 20, label: "Retention" },
  margin: { document: "deck", page: 21, label: "Margin profile" },
  guide: { document: "deck", page: 25, label: "Forward guidance" },
  cash: { document: "deck", page: 33, label: "Cash conversion" },
  call09: { document: "transcript", page: 9, label: "Management commentary" },
  call14: { document: "transcript", page: 14, label: "Analyst questions" }
};

const STAGES = [
  { id: "triage", label: "Package", evidence: EVIDENCE.kpi, pending: "Opening the earnings package", detail: "Indexing the report, call transcript, financial tables, and chart pages." },
  { id: "beat", label: "Quarterly beat", evidence: EVIDENCE.growth, pending: "Measuring the reported beat", detail: "Comparing reported product revenue with the prior guide and consensus expectations." },
  { id: "dashboard", label: "Key metrics", evidence: EVIDENCE.kpi, pending: "Building the quarter dashboard", detail: "Reading the central growth, customer, retention, and margin indicators." },
  { id: "growth", label: "Growth quality", evidence: EVIDENCE.growth, pending: "Testing the quality of growth", detail: "Separating durable demand from temporary migration and timing effects." },
  { id: "backlog", label: "Backlog", evidence: EVIDENCE.rpo, pending: "Checking backlog durability", detail: "Reviewing remaining obligations and the timing of expected conversion." },
  { id: "retention", label: "Retention", evidence: EVIDENCE.nrr, pending: "Reading the retention trend", detail: "Checking whether customer expansion supports the reported acceleration." },
  { id: "conversion", label: "Margins", evidence: EVIDENCE.margin, pending: "Comparing growth with margins", detail: "Testing whether revenue acceleration is converting into stronger earnings quality." },
  { id: "cash", label: "Cash flow", evidence: EVIDENCE.cash, pending: "Tracing cash conversion", detail: "Inspecting operating cash flow, adjusted free cash flow, and capital intensity." },
  { id: "outlook", label: "Guidance", evidence: EVIDENCE.guide, pending: "Comparing the new outlook", detail: "Checking whether next-quarter and full-year guidance sustain the current pace." },
  { id: "assessment", label: "First conclusion", evidence: EVIDENCE.guide, pending: "Drafting the first conclusion", detail: "Combining the financial signals into an initial view of the run rate." },
  { id: "transcript", label: "Management call", evidence: EVIDENCE.call09, pending: "Testing management's explanation", detail: "Comparing the prepared narrative with the numbers and forward outlook." },
  { id: "filing", label: "Disclosures", evidence: EVIDENCE.call14, pending: "Checking the detailed disclosures", detail: "Looking for constraints, definitions, and risks that change the initial read." },
  { id: "stress", label: "Stress test", evidence: EVIDENCE.guide, pending: "Stress-testing the run rate", detail: "Normalizing temporary contributors and weighing the evidence against guidance." },
  { id: "challenge", label: "Revised conclusion", evidence: EVIDENCE.call14, pending: "Revising the final conclusion", detail: "Applying the analyst challenge and resolving the strongest counterarguments." }
];

const LANE_META = {
  cerebras: { name: "Cerebras (WSE)", accent: "orange" },
  openrouter: { name: "GPU Inference", accent: "neutral" }
};

function newLane() {
  return { status: "idle", activeStage: null, results: {}, final: null, error: "", elapsedMs: 0 };
}

function formatClock(milliseconds = 0) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function sentenceCase(value) {
  const text = String(value || "")
    .replace(/\bSnowflake(?:,? Inc\.?)?\b/gi, "the issuer")
    .replace(/\bSNOW\b/g, "the issuer")
    .replace(/\bSnowpark\b/gi, "the platform")
    .replace(/\bCortex(?: AI)?\b/gi, "the platform")
    .replace(/\bPolaris(?: Catalog)?\b/gi, "the catalog service")
    .replace(/\bApache Iceberg\b/gi, "the open table format")
    .replaceAll("_", " ")
    .trim();
  const index = text.search(/[A-Za-z]/);
  if (index < 0) return text;
  return `${text.slice(0, index)}${text[index].toUpperCase()}${text.slice(index + 1)}`;
}

function splitSentences(value) {
  const protectedText = sentenceCase(value).replace(/(\d)\.(\d)/g, "$1\u0000$2");
  return (protectedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [protectedText])
    .map((sentence) => sentence.trim().replaceAll("\u0000", "."))
    .filter(Boolean);
}

function splitParagraphs(value) {
  const sentences = splitSentences(value);
  const paragraphs = [];
  for (let index = 0; index < sentences.length; index += 2) paragraphs.push(sentences.slice(index, index + 2).join(" "));
  return paragraphs;
}

function findingText(stage, data) {
  if (!data) return "";
  if (stage === "triage") return data.central_question;
  if (stage === "assessment") return data.headline;
  if (stage === "challenge") return data.revised_headline;
  return data.finding;
}

function supportText(stage, data) {
  if (!data) return "";
  if (stage === "triage") return data.initial_read || data.package_summary;
  if (stage === "beat") return data.caveat;
  if (stage === "dashboard") return data.strongest_signal;
  if (stage === "growth") return data.durability_question;
  if (stage === "backlog" || stage === "retention") return data.limitation;
  if (stage === "conversion") return data.earnings_quality_tension;
  if (stage === "cash") return data.quality_caveat;
  if (stage === "outlook") return data.run_rate_implication;
  if (stage === "assessment") return data.conclusion;
  if (stage === "transcript") return data.management_explanation;
  if (stage === "filing") return data.what_it_changes;
  if (stage === "stress") return data.normalized_view;
  if (stage === "challenge") return data.direct_answer || data.revised_conclusion;
  return "";
}

async function readNdjson(response, onEvent) {
  if (!response.ok) throw new Error(`Review request failed (${response.status}).`);
  if (!response.body) throw new Error("The server did not return a response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines.filter(Boolean)) onEvent(JSON.parse(line));
    if (done) break;
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}

function currentStageFor(lane) {
  if (lane.activeStage) return STAGES.find((stage) => stage.id === lane.activeStage) || STAGES[0];
  return [...STAGES].reverse().find((stage) => lane.results[stage.id]) || STAGES[0];
}

function Lane({ laneId, lane }) {
  const meta = LANE_META[laneId];
  const stage = currentStageFor(lane);
  const stageIndex = STAGES.findIndex((item) => item.id === stage.id);
  const completed = Object.keys(lane.results).length;
  const displayCount = lane.status === "running" ? Math.max(completed, stageIndex + 1) : completed;
  const payload = lane.results[stage.id]?.result;
  const rawHeadline = payload ? findingText(stage.id, payload) : stage.pending;
  const headlineSentences = splitSentences(rawHeadline);
  const isFinal = stage.id === "challenge" && Boolean(payload);
  const headline = isFinal ? CONCLUSION_QUESTION : headlineSentences[0] || stage.pending;
  const detail = isFinal
    ? payload.direct_answer || payload.revised_conclusion || supportText(stage.id, payload)
    : "";
  const evidence = stage.evidence;

  return (
    <section className={`qd8-lane ${meta.accent}`} aria-label={`${meta.name} review`}>
      <header className="qd8-lane-header">
        <h2>{meta.name}</h2>
        <span className="qd8-clock">{formatClock(lane.elapsedMs)}</span>
      </header>

      <div className="qd8-scan-panel">
        <div className="qd8-counter"><strong><b>{displayCount}</b><em>/{STAGES.length}</em></strong><span>STEPS</span></div>
        <div className="qd8-document">
          <div className="qd8-document-label">{evidence.label}</div>
          <img src={`/api/example/${evidence.document}/${evidence.page}`} alt={`${evidence.label}, page ${evidence.page}`} />
          {lane.status === "running" && <i className="qd8-scan-line" />}
        </div>
        <div className="qd8-progress" aria-label={`${displayCount} of ${STAGES.length} steps`}><b style={{ width: `${(displayCount / STAGES.length) * 100}%` }} /></div>
      </div>

      <div className="qd8-finding" key={`${stage.id}-${Boolean(payload)}`}>
        <span className="qd8-step-label">{isFinal ? "CONCLUSION" : `STEP ${String(stageIndex + 1).padStart(2, "0")} · ${stage.label}`}</span>
        {lane.error ? (
          <div className="qd8-error"><strong>Review stopped</strong><p>{lane.error}</p></div>
        ) : (
          <>
            <h3>{sentenceCase(headline)}</h3>
            {isFinal && <div className="qd8-detail">{splitParagraphs(detail).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>}
          </>
        )}
      </div>
    </section>
  );
}

export function QwenLiveEarningsCompare() {
  const [showIntro, setShowIntro] = useState(() => new URLSearchParams(window.location.search).get("intro") !== "0");
  const [introCompleted, setIntroCompleted] = useState(false);
  const [autoStartPending, setAutoStartPending] = useState(false);
  const [status, setStatus] = useState(null);
  const [running, setRunning] = useState(false);
  const [lanes, setLanes] = useState({ openrouter: newLane(), cerebras: newLane() });
  const startedAt = useRef({});
  const autoStartTimer = useRef(null);

  useEffect(() => {
    fetch("/api/status").then((result) => result.json()).then(setStatus).catch(() => setStatus({ connected: false }));
    return () => window.clearTimeout(autoStartTimer.current);
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      setLanes((current) => Object.fromEntries(Object.entries(current).map(([laneId, lane]) => [
        laneId,
        lane.status === "running" ? { ...lane, elapsedMs: performance.now() - startedAt.current[laneId] } : lane
      ])));
    }, 100);
    return () => window.clearInterval(timer);
  }, [running]);

  const totalComplete = useMemo(() => Object.values(lanes).reduce((sum, lane) => sum + Object.keys(lane.results).length, 0), [lanes]);
  const bothComplete = Object.values(lanes).every((lane) => lane.status === "complete");

  function updateLane(laneId, updater) {
    setLanes((current) => ({ ...current, [laneId]: updater(current[laneId]) }));
  }

  async function runLane(laneId) {
    startedAt.current[laneId] = performance.now();
    try {
      const response = await fetch(`/api/analyze?lane=${laneId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge: DEFAULT_CHALLENGE })
      });
      await readNdjson(response, (event) => {
        if (event.type === "stage_start") updateLane(laneId, (lane) => ({ ...lane, activeStage: event.stage }));
        if (event.type === "stage_result") updateLane(laneId, (lane) => ({ ...lane, results: { ...lane.results, [event.stage]: event } }));
        if (event.type === "result") updateLane(laneId, (lane) => ({ ...lane, status: "complete", activeStage: null, final: event, elapsedMs: event.elapsedMs }));
        if (event.type === "error") throw new Error(event.message);
      });
      return true;
    } catch (caught) {
      updateLane(laneId, (lane) => ({ ...lane, status: "error", activeStage: null, error: caught.message || "Review failed." }));
      return false;
    }
  }

  async function runComparison() {
    setLanes({ openrouter: { ...newLane(), status: "running" }, cerebras: { ...newLane(), status: "running" } });
    setRunning(true);
    await Promise.all([runLane("openrouter"), runLane("cerebras")]);
    setRunning(false);
  }

  const reviewScreen = (
    <main className={`qd8-shell q-dot-field${introCompleted ? " qd8-scene-enter" : ""}`}>
      <header className="qd8-titlebar">
        <div><h1>Earnings Call Review</h1></div>
        <div className="qd8-run-summary"><span>{autoStartPending ? "PREPARING REVIEW" : running ? "REVIEW RUNNING" : bothComplete ? "REVIEW COMPLETE" : "READY"}</span><strong>{totalComplete}/{STAGES.length * 2} STEPS</strong></div>
        <button type="button" className={running || autoStartPending ? "is-reviewing" : ""} onClick={runComparison} disabled={running || autoStartPending || !status?.connected}>{autoStartPending ? "Starting" : running ? "Reviewing" : bothComplete ? "Run again" : "Run review"}</button>
      </header>

      <section className="qd8-race" aria-label="Earnings review comparison">
        <Lane laneId="cerebras" lane={lanes.cerebras} />
        <Lane laneId="openrouter" lane={lanes.openrouter} />
      </section>

      <footer className="qd8-legal">Uses publicly available financial documents. No endorsement, partnership, or affiliation is implied. AI-generated analysis may be inaccurate and is not investment advice.</footer>
    </main>
  );

  if (showIntro) {
    return <>
      {introCompleted && reviewScreen}
      <PromptIntro
        prompt={INTRO_PROMPT}
        attachments={INTRO_ATTACHMENTS}
        onSend={() => {
          setIntroCompleted(true);
          setAutoStartPending(true);
        }}
        onComplete={() => {
          setShowIntro(false);
          autoStartTimer.current = window.setTimeout(() => {
            setAutoStartPending(false);
            void runComparison();
          }, 500);
        }}
      />
    </>;
  }

  return reviewScreen;
}
