import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../shared/quant-base.css";
import { PromptIntro } from "../../shared/PromptIntro.jsx";
import "./qwen-sec-compare.css";

const DEFAULT_CHALLENGE = "Management says the revised projections are more reliable, and the $28 offer falls inside the revised DCF range. Does that make the transaction fair?";
const CONCLUSION_QUESTION = "Does the valuation evidence establish that the $28 offer is fair?";
const INTRO_PROMPT = "Analyze the attached SEC filing and determine whether the valuation evidence establishes that the $28 offer is fair.";
const INTRO_ATTACHMENTS = [
  { src: "/api/example/page/1", alt: "Transaction filing cover" },
  { src: "/api/example/page/41", alt: "Sale process evidence" },
  { src: "/api/example/page/45", alt: "Valuation range evidence" }
];
const MAX_STEP_CHARACTERS = 540;
const MAX_HEADLINE_CHARACTERS = 190;

const EVIDENCE = {
  filing: { page: 1, label: "Transaction filing" },
  thesis: { page: 7, label: "Stockholder thesis" },
  proxy: { page: 37, label: "Definitive proxy" },
  board: { page: 38, label: "Board response" },
  process: { page: 41, label: "Sale process" },
  forecast: { page: 42, label: "Management forecasts" },
  dcf: { page: 43, label: "Discounted cash flow" },
  wacc: { page: 44, label: "Discount rate" },
  value: { page: 45, label: "Valuation range" }
};

const STAGES = [
  { id: "triage", label: "Package", evidence: EVIDENCE.filing, pending: "Opening the transaction filing", detail: "Indexing the 81-page filing and locating the most decision-relevant valuation evidence." },
  { id: "process", label: "Sale process", evidence: EVIDENCE.process, pending: "Reconstructing the sale process", detail: "Comparing the process timeline with the cited precedent transactions." },
  { id: "projections", label: "Forecasts", evidence: EVIDENCE.forecast, pending: "Comparing management forecasts", detail: "Tracing the changes between the initial and revised operating projections." },
  { id: "dcf", label: "DCF range", evidence: EVIDENCE.dcf, pending: "Reading the DCF range", detail: "Locating the offer within both the initial and revised valuation ranges." },
  { id: "discount", label: "Discount rate", evidence: EVIDENCE.wacc, pending: "Testing the discount rate", detail: "Comparing the adviser rate with company and peer cost-of-capital estimates." },
  { id: "alternatives", label: "Cross-check", evidence: EVIDENCE.value, pending: "Running the valuation cross-check", detail: "Recalculating the range under alternative forecast and discount-rate assumptions." },
  { id: "proxyResearch", label: "Proxy evidence", evidence: EVIDENCE.proxy, pending: "Checking the definitive proxy", detail: "Verifying the stated rationale, process record, and public transaction disclosures." },
  { id: "companyResearch", label: "Countercase", evidence: EVIDENCE.board, pending: "Testing the board's countercase", detail: "Weighing the offer premium, standalone risks, and response to the valuation critique." },
  { id: "assessment", label: "First conclusion", evidence: EVIDENCE.thesis, pending: "Drafting the first deal brief", detail: "Combining the process, forecast, and valuation evidence into an initial assessment." },
  { id: "challenge", label: "Revised conclusion", evidence: EVIDENCE.value, pending: "Revising the final conclusion", detail: "Applying the analyst challenge and resolving the strongest remaining objections." }
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
  const replacements = {
    supports_offer: "supports the offer",
    opposes_offer: "opposes the offer",
    insufficient_evidence: "insufficient evidence"
  };
  const text = String(value ?? "")
    .replace(/\bSTAAR Surgical(?: Company)?\b/gi, "the issuer")
    .replace(/\bSTAAR\b/gi, "the issuer")
    .replace(/\bAlcon(?: Inc\.?| AG)?\b/gi, "the buyer")
    .replace(/\bBroadwood Partners\b/gi, "the opposing stockholder")
    .replace(/\bBroadwood\b/gi, "the opposing stockholder")
    .replace(/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/gi, (token) => replacements[token.toLowerCase()] || token.replaceAll("_", " "))
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

function conciseConclusion(value) {
  return splitSentences(value).slice(0, 3).join(" ");
}

function fitText(value, maxCharacters) {
  const text = sentenceCase(value).replace(/\s+/g, " ").trim();
  if (!text || text.length <= maxCharacters) return text;

  const completeSentences = [];
  for (const sentence of splitSentences(text)) {
    const candidate = [...completeSentences, sentence].join(" ");
    if (candidate.length > maxCharacters) break;
    completeSentences.push(sentence);
  }
  if (completeSentences.length) return completeSentences.join(" ");

  const clipped = text.slice(0, Math.max(0, maxCharacters - 1));
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 0 ? lastSpace : clipped.length).trimEnd()}…`;
}

function fitStepCopy(headline, detail) {
  const fittedHeadline = fitText(headline, MAX_HEADLINE_CHARACTERS);
  const detailBudget = Math.max(0, MAX_STEP_CHARACTERS - fittedHeadline.length);
  return {
    headline: fittedHeadline,
    detail: fitText(detail, detailBudget)
  };
}

function findingText(stage, data) {
  if (!data) return "";
  if (stage === "triage") return data.core_question;
  if (stage === "proxyResearch") return data.what_it_confirms;
  if (stage === "companyResearch") return data.what_changes;
  if (stage === "assessment") return data.headline;
  if (stage === "challenge") return data.revised_conclusion || data.answer;
  return data.finding;
}

function supportText(stage, data) {
  if (!data) return "";
  if (stage === "triage") return (data.initial_signals || []).join(" ");
  if (stage === "process") return data.limitation;
  if (stage === "projections") return data.open_question;
  if (stage === "dcf") return data.methodology_caveat;
  if (stage === "discount") return data.caveat;
  if (stage === "alternatives") return data.offer_position || data.finding;
  if (stage === "proxyResearch") return data.what_it_does_not_confirm;
  if (stage === "companyResearch") return data.valuation_response;
  if (stage === "assessment") return data.conclusion;
  if (stage === "challenge") return data.answer;
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

function visibleStageFor(lane) {
  return [...STAGES].reverse().find((stage) => lane.results[stage.id]) || STAGES[0];
}

function Lane({ laneId, lane }) {
  const meta = LANE_META[laneId];
  const stage = visibleStageFor(lane);
  const stageIndex = STAGES.findIndex((item) => item.id === stage.id);
  const completed = Object.keys(lane.results).length;
  const displayCount = completed;
  const payload = lane.results[stage.id]?.result;
  const rawHeadline = payload ? findingText(stage.id, payload) : stage.pending;
  const headlineSentences = splitSentences(rawHeadline);
  const isFinal = stage.id === "challenge" && Boolean(payload);
  const headline = isFinal ? CONCLUSION_QUESTION : headlineSentences[0] || stage.pending;
  const detail = isFinal
    ? conciseConclusion(payload.answer || payload.revised_conclusion || supportText(stage.id, payload))
    : "";
  const copy = fitStepCopy(headline, detail);
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
          <img src={`/api/example/page/${evidence.page}`} alt={`${evidence.label}, page ${evidence.page}`} />
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
            <h3>{copy.headline}</h3>
            {isFinal && copy.detail && <div className="qd8-detail"><p>{copy.detail}</p></div>}
          </>
        )}
      </div>
    </section>
  );
}

export function QwenSecDealCompare() {
  const [showIntro, setShowIntro] = useState(() => new URLSearchParams(window.location.search).get("intro") !== "0");
  const [introCompleted, setIntroCompleted] = useState(false);
  const [status, setStatus] = useState(null);
  const [running, setRunning] = useState(false);
  const [lanes, setLanes] = useState({ openrouter: newLane(), cerebras: newLane() });
  const startedAt = useRef({});

  useEffect(() => {
    fetch("/api/status").then((result) => result.json()).then(setStatus).catch(() => setStatus({ connected: false }));
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
    <main className={`qd8-shell qs-shell q-dot-field${introCompleted ? " qd8-scene-enter" : ""}`}>
      <header className="qd8-titlebar">
        <div><h1>SEC Filing Review</h1></div>
        <div className="qd8-run-summary"><span>{running ? "REVIEW RUNNING" : bothComplete ? "REVIEW COMPLETE" : "READY"}</span><strong>{totalComplete}/{STAGES.length * 2} STEPS</strong></div>
        <button type="button" className={running ? "is-reviewing" : ""} onClick={runComparison} disabled={running || !status?.connected}>{running ? "Reviewing" : bothComplete ? "Run again" : "Run review"}</button>
      </header>

      <section className="qd8-race" aria-label="Deal fairness comparison">
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
          void runComparison();
        }}
        onComplete={() => setShowIntro(false)}
      />
    </>;
  }

  return reviewScreen;
}
