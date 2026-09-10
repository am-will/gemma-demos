import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "../../shared/quant-base.css";
import { PromptIntro } from "../../shared/PromptIntro.jsx";
import cerebrasLogo from "../../../car-damage/public/assets/cerebras-logo.png";
import qwenLogo from "./assets/qwen-symbol-transparent.png";
import "./qwen-sec-chat.css";

const PROMPT = "Analyze the attached 81-page document and provide a concise financial analysis.";
const CHALLENGE = "Management says the revised projections are more reliable, and the $28 offer falls inside the revised DCF range. Does that make the transaction fair?";
const ATTACHMENTS = [
  { src: "/api/example/page/1", alt: "Transaction filing cover" },
  { src: "/api/example/page/41", alt: "Sale process evidence" },
  { src: "/api/example/page/45", alt: "Valuation range evidence" }
];
const INSPECT_PAGES = [1, 37, 41, 44, 45];
const TOTAL_PAGES = 81;
const LANE_RETRY_DELAYS_MS = [1000, 2000, 4000, 6000];
const CONFETTI_COLORS = ["#f15a29", "#ffb092", "#ffd23f", "#5ce6a5", "#36c5ff", "#ffffff"];
const CONFETTI_SHAPES = ["rect", "rect", "circle", "ribbon"];

const STEPS = [
  { id: "triage", label: "Document map" },
  { id: "process", label: "Sale process" },
  { id: "projections", label: "Forecast changes" },
  { id: "dcf", label: "DCF range" },
  { id: "discount", label: "Discount rate" },
  { id: "alternatives", label: "Valuation cross-check" },
  { id: "proxyResearch", label: "Proxy evidence" },
  { id: "companyResearch", label: "Countercase" },
  { id: "challenge", label: "Conclusion" }
];

const COMPLETION_DEMO_MESSAGES = {
  cerebras: [
    { stage: "triage", label: "Document map", text: "The filing frames the decision around the sale process, revised forecasts, and the discount rate used in the fairness opinion." },
    { stage: "process", label: "Sale process", text: "The 30-day process was shorter than the cited precedent median, but the comparison alone does not establish that the process was inadequate." },
    { stage: "projections", label: "Forecast changes", text: "The revised case lowers 2026 revenue and EBITDA while modestly increasing the near-term outlook." },
    { stage: "dcf", label: "DCF range", text: "The $28 offer falls within both the initial and revised DCF ranges, though the revised midpoint is lower." },
    { stage: "discount", label: "Discount rate", text: "The 14% discount rate is materially above the issuer's cited cost-of-capital estimates and weighs on the valuation." },
    { stage: "alternatives", label: "Valuation cross-check", text: "Alternative assumptions produce ranges extending well above the offer price." },
    { stage: "proxyResearch", label: "Proxy evidence", text: "The proxy confirms two projection sets and the board's consideration of standalone risks." },
    { stage: "companyResearch", label: "Countercase", text: "The public defense explains the strategic rationale but does not independently validate the contested discount rate." },
    { stage: "challenge", label: "Conclusion", text: "No, falling within the revised DCF range does not establish fairness because the discount rate remains contested. More conventional assumptions produce values above the offer price, leaving the transaction's fairness uncertain." }
  ],
  openrouter: [
    { stage: "triage", label: "Document map", text: "The review centers on process timing, projection revisions, and the valuation assumptions supporting the offer." },
    { stage: "process", label: "Sale process", text: "The process was relatively short, although the cited precedent data does not prove that it failed to test the market." },
    { stage: "projections", label: "Forecast changes", text: "The final forecasts reduce the longer-term revenue and EBITDA outlook relative to the preliminary case." },
    { stage: "dcf", label: "DCF range", text: "The offer sits inside the disclosed DCF ranges, but range inclusion is not conclusive evidence of fairness." },
    { stage: "discount", label: "Discount rate", text: "The financial adviser's discount rate exceeds several cost-of-capital reference points cited by the opposing stockholder." },
    { stage: "alternatives", label: "Valuation cross-check", text: "Using the initial forecasts and a lower discount rate raises the implied valuation range." },
    { stage: "proxyResearch", label: "Proxy evidence", text: "The proxy documents the forecast revisions and confirms which projections informed the fairness opinion." },
    { stage: "companyResearch", label: "Countercase", text: "Management's rationale supports the revisions but does not eliminate uncertainty around the valuation inputs." },
    { stage: "challenge", label: "Conclusion", text: "No, the offer's placement within the revised range is not enough to prove fairness. The higher discount rate suppresses the valuation, while alternative assumptions imply meaningful upside above $28." }
  ]
};

const LANE_META = {
  cerebras: { name: "Cerebras (WSE)", tone: "orange" },
  openrouter: { name: "GPU Inference", tone: "neutral" }
};

function newLane() {
  return { messages: [], activeStep: null, status: "idle", error: "", elapsedMs: 0 };
}

function completionDemoLane(laneId) {
  return {
    ...newLane(),
    messages: COMPLETION_DEMO_MESSAGES[laneId]
  };
}

function anonymize(value) {
  return String(value ?? "")
    .replace(/[\u0012-\u0014]/g, "–")
    .replace(/[\u0018\u0019]/g, "’")
    .replace(/[\u0001-\u0011\u0015-\u0017\u001a-\u001f\u007f-\u009f]/g, " ")
    .replace(/\bSTAAR Surgical(?: Company)?\b/gi, "the issuer")
    .replace(/\bSTAAR\b/gi, "the issuer")
    .replace(/\bAlcon(?: Inc\.?| AG)?\b/gi, "the buyer")
    .replace(/\bBroadwood Partners\b/gi, "the opposing stockholder")
    .replace(/\bBroadwood\b/gi, "the opposing stockholder")
    .replace(/\bsupports_offer\b/gi, "The evidence supports the offer")
    .replace(/\bopposes_offer\b/gi, "The evidence weighs against the offer")
    .replace(/\binsufficient_evidence\b/gi, "The evidence is insufficient to reach a firm conclusion")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(value) {
  const protectedText = anonymize(value).replace(/(\d)\.(\d)/g, "$1\u0000$2");
  return (protectedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map((sentence) => sentence.trim().replaceAll("\u0000", "."))
    .filter(Boolean);
}

function concise(value, maxSentences = 2, maxCharacters = 380) {
  const sentences = splitSentences(value).slice(0, maxSentences);
  const text = sentences.join(" ");
  if (text.length <= maxCharacters) return text;
  const clipped = text.slice(0, maxCharacters - 1);
  const breakAt = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, breakAt > 0 ? breakAt : clipped.length).trim()}…`;
}

function messageCopy(stageId, result) {
  if (!result) return "";
  const fields = {
    triage: result.core_question,
    process: result.finding,
    projections: result.finding,
    dcf: result.finding,
    discount: result.finding,
    alternatives: result.finding,
    proxyResearch: result.what_it_confirms,
    companyResearch: result.what_changes,
    challenge: result.answer || result.revised_conclusion
  };
  return concise(fields[stageId], stageId === "challenge" ? 3 : 2, stageId === "challenge" ? 540 : 380);
}

function formatClock(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function elapsedTenths(milliseconds) {
  return Math.floor(Math.max(0, milliseconds || 0) / 100);
}

function formatRaceClock(milliseconds) {
  const totalTenths = elapsedTenths(milliseconds);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor(totalTenths / 10) % 60;
  const tenths = totalTenths % 10;
  return minutes === 0 ? `${seconds}.${tenths}s` : `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

const pick = (items) => items[Math.floor(Math.random() * items.length)];

function createConfettiPieces(baseDelay) {
  return Array.from({ length: 10 }, (_, id) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 2.6 + Math.random() * 5.2;
    const burstX = Math.cos(angle) * distance;
    const burstY = Math.sin(angle) * distance - 1.2;
    const fallX = burstX + (Math.random() - .5) * 2.6;
    const fallY = burstY + 6 + Math.random() * 8;
    const spin = (Math.random() < .5 ? -1 : 1) * (240 + Math.random() * 540);
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
        "--size": `${(.34 + Math.random() * .38).toFixed(2)}rem`,
        "--delay": `${baseDelay + Math.round(Math.random() * 70)}ms`,
        "--duration": `${Math.round(1100 + Math.random() * 620)}ms`,
        "--flutter": `${Math.round(320 + Math.random() * 480)}ms`
      }
    };
  });
}

function createConfettiBursts() {
  const zones = [
    [18, 15], [48, 12], [80, 18],
    [22, 54], [52, 58], [78, 50]
  ];
  return zones.map(([left, top], id) => ({
    id,
    left: `${left + (Math.random() - .5) * 10}%`,
    top: `${top + (Math.random() - .5) * 9}%`,
    pieces: createConfettiPieces(id * 90 + Math.round(Math.random() * 60))
  }));
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

function CerebrasMark() {
  return <span className="qchat-brand-mark" aria-hidden="true"><img src={cerebrasLogo} alt="" /></span>;
}

function ProviderMark({ laneId }) {
  const isGpu = laneId === "openrouter";
  return (
    <span className={`qchat-brand-mark${isGpu ? " qwen" : ""}`} aria-hidden="true">
      <img src={isGpu ? qwenLogo : cerebrasLogo} alt="" />
    </span>
  );
}

function DocumentScan({ progress, exiting }) {
  const displayedPage = Math.min(TOTAL_PAGES, 1 + Math.floor(progress * TOTAL_PAGES));
  const pageProgress = displayedPage / TOTAL_PAGES * 100;
  const previewPage = INSPECT_PAGES[(displayedPage - 1) % INSPECT_PAGES.length];

  return (
    <section className={`qchat-scan q-dot-field${exiting ? " is-exiting" : ""}`} aria-label="Reviewing the 81-page SEC filing">
      <header className="qchat-scan-header">
        <div>
          <span>DOCUMENT REVIEW</span>
          <strong>Reading the filing</strong>
        </div>
        <div className="qchat-scan-meter" aria-label={`${displayedPage} of ${TOTAL_PAGES} pages reviewed`}><i><b style={{ width: `${pageProgress}%` }} /></i></div>
      </header>

      <div className="qchat-scan-stage">
        <figure className="qchat-scan-document is-rapid" key={`page-${displayedPage}`}>
          <figcaption>Reading the complete filing</figcaption>
          <img src={`/api/example/page/${previewPage}`} alt="SEC filing excerpt" />
          <div className="qchat-rapid-pages" aria-hidden="true"><i /><i /><i /></div>
        </figure>
        <div className="qchat-scan-status is-rapid">
          <span>QWEN IS READING</span>
          <em className="qchat-page-total"><b>{displayedPage}</b><i>/ {TOTAL_PAGES}</i></em>
          <strong>Testing the valuation evidence</strong>
        </div>
      </div>
    </section>
  );
}

function AssistantMessage({ message, index, laneId }) {
  const isFinal = message.stage === "challenge";
  return (
    <article className={`qchat-message qchat-assistant${isFinal ? " is-final" : ""}`} style={{ "--message-index": index }}>
      <ProviderMark laneId={laneId} />
      <div className="qchat-message-body">
        <div className="qchat-message-meta"><strong>Qwen 3.8 27B</strong>{isFinal && <span>Final answer</span>}</div>
        <h2>{isFinal ? "Does the valuation evidence establish that the $28 offer is fair?" : message.label}</h2>
        <p>{message.text}</p>
      </div>
    </article>
  );
}

function ThinkingMessage({ label, laneId }) {
  return (
    <div className="qchat-message qchat-assistant qchat-thinking">
      <ProviderMark laneId={laneId} />
      <div><strong>{label || "Reviewing the filing"}</strong><span><i /><i /><i /></span></div>
    </div>
  );
}

function CerebrasCelebration() {
  const burstsRef = useRef(null);
  if (!burstsRef.current) burstsRef.current = createConfettiBursts();

  return (
    <div className="qchat-celebration" aria-hidden="true">
      {burstsRef.current.map((burst) => (
        <div className="qchat-confetti-burst" key={burst.id} style={{ left: burst.left, top: burst.top }}>
          {burst.pieces.map((piece) => (
            <span className="qchat-confetti-piece" key={piece.id} style={piece.style}>
              <i className={`qchat-confetti-shape ${piece.shape}`} style={{ "--color": piece.color }} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function LaneCompletion({ laneId, milliseconds }) {
  const cardRef = useRef(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const source = document.querySelector(`[data-lane-clock="${laneId}"]`);
    if (!card || !source || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return undefined;

    const from = source.getBoundingClientRect();
    const to = card.getBoundingClientRect();
    const scale = Math.max(.12, Math.min(.28, from.width / to.width));
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const animation = card.animate([
      { opacity: 0, transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scale})` },
      { opacity: 1, offset: .28 },
      { transform: "translate3d(0, 0, 0) scale(1.045)", offset: .78 },
      { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" }
    ], {
      duration: 820,
      easing: "cubic-bezier(.2, .86, .24, 1)",
      fill: "backwards"
    });
    return () => animation.cancel();
  }, [laneId, milliseconds]);

  return (
    <div className={`qchat-lane-completion ${laneId}`} role="status" aria-live="polite">
      <div className="qchat-lane-completion-card" ref={cardRef}>
        <strong>DONE</strong>
        <b>{(elapsedTenths(milliseconds) / 10).toFixed(1)} sec</b>
      </div>
    </div>
  );
}

function ChatLane({ laneId, lane, prompt }) {
  const threadRef = useRef(null);
  const meta = LANE_META[laneId];
  const running = lane.status === "running";
  const complete = lane.status === "complete";
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (laneId !== "cerebras" || !complete) {
      setCelebrate(false);
      return undefined;
    }
    setCelebrate(true);
    const timeout = window.setTimeout(() => setCelebrate(false), 3200);
    return () => window.clearTimeout(timeout);
  }, [laneId, complete]);

  useEffect(() => {
    const container = threadRef.current;
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [lane.messages, lane.activeStep, lane.error]);

  return (
    <section className={`qchat-lane ${meta.tone}${celebrate ? " is-celebrating" : ""}${complete ? " is-complete" : ""}`} aria-label={`${meta.name} Qwen 3.8 27B review`}>
      {celebrate && <CerebrasCelebration />}
      <header className="qchat-lane-header">
        <div><strong>{meta.name}</strong><span>Qwen 3.8 27B</span></div>
        <b className={`qchat-lane-clock${complete ? " is-complete" : ""}`} data-lane-clock={laneId}>
          {complete ? formatRaceClock(lane.elapsedMs) : formatClock(lane.elapsedMs)}
        </b>
      </header>

      <section className="qchat-thread" ref={threadRef}>
        <div className="qchat-thread-inner">
          <article className="qchat-message qchat-user">
            <div className="qchat-user-copy">{prompt}</div>
            <div className="qchat-attachment">
              <img src="/api/example/page/1" alt="Attached transaction filing" />
              <div><strong>Public transaction filing</strong><span>PDF · 81 pages</span></div>
            </div>
          </article>

          {lane.messages.map((message, index) => <AssistantMessage key={message.stage} message={message} index={index} laneId={laneId} />)}
          {running && <ThinkingMessage label={lane.activeStep?.label} laneId={laneId} />}
        </div>
      </section>

      <footer className="qchat-composer-wrap">
        <div className="qchat-composer">
          <div className="qchat-composer-input">Ask a follow-up</div>
          <div className="qchat-composer-tools">
            <button type="button" aria-label="Attach a file">+</button>
            <div className="qchat-model"><ProviderMark laneId={laneId} /><span><strong>Qwen 3.8 27B</strong><small>{running ? "Analyzing" : "Ready"}</small></span><i /></div>
            <button type="button" className="qchat-send" aria-label="Send follow-up">↑</button>
          </div>
        </div>
      </footer>
      {complete && <LaneCompletion laneId={laneId} milliseconds={lane.elapsedMs} />}
    </section>
  );
}

function ChatScreen({ lanes, prompt }) {
  return (
    <main className="qchat-chat q-dot-field" aria-label="Qwen 3.8 27B side-by-side SEC filing review">
      <section className="qchat-lanes">
        <ChatLane laneId="cerebras" lane={lanes.cerebras} prompt={prompt} />
        <ChatLane laneId="openrouter" lane={lanes.openrouter} prompt={prompt} />
      </section>
      <footer className="qchat-legal">Uses publicly available financial documents. AI-generated analysis may be inaccurate and is not investment advice.</footer>
    </main>
  );
}

export function QwenSecChatReview({
  skipDocumentScene = false,
  PromptScene = PromptIntro,
  prompt = PROMPT,
  completionDemo = false,
  completionDemoLoopMs = 5000,
  onReviewComplete
}) {
  const skipIntro = useMemo(() => new URLSearchParams(window.location.search).get("intro") === "0", []);
  const [showIntro, setShowIntro] = useState(completionDemo ? false : !skipIntro);
  const [scene, setScene] = useState(completionDemo ? "chat" : (skipIntro ? (skipDocumentScene ? "chat" : "scan") : "prompt"));
  const [scanProgress, setScanProgress] = useState(0);
  const [scanExiting, setScanExiting] = useState(false);
  const [showChat, setShowChat] = useState(completionDemo || (skipIntro && skipDocumentScene));
  const [lanes, setLanes] = useState(() => completionDemo
    ? { cerebras: completionDemoLane("cerebras"), openrouter: completionDemoLane("openrouter") }
    : { cerebras: newLane(), openrouter: newLane() });
  const startedAt = useRef({});
  const reviewStarted = useRef(false);
  const completionNotified = useRef(false);

  useEffect(() => {
    if (completionDemo) return undefined;
    if (scene !== "scan") return undefined;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduceMotion ? 80 : 720;
    const duration = reduceMotion ? 500 : 2400;
    const started = performance.now() + delay;
    let transitionTimer;

    const timer = window.setInterval(() => {
      const progress = Math.min(1, Math.max(0, (performance.now() - started) / duration));
      setScanProgress(progress);
      if (progress >= 1) {
        window.clearInterval(timer);
        setShowChat(true);
        setScanExiting(true);
        transitionTimer = window.setTimeout(() => {
          setScene("chat");
          void startReview();
        }, reduceMotion ? 20 : 760);
      }
    }, reduceMotion ? 16 : 20);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(transitionTimer);
    };
  }, [completionDemo, scene]);

  useEffect(() => {
    if (completionDemo) return undefined;
    if (!skipDocumentScene || showIntro || scene !== "chat") return undefined;
    const timer = window.setTimeout(() => void startReview(), 500);
    return () => window.clearTimeout(timer);
  }, [completionDemo, skipDocumentScene, showIntro, scene]);

  useEffect(() => {
    if (!completionDemo) return undefined;
    const timers = new Set();
    let loop;

    const later = (callback, delay) => {
      const timer = window.setTimeout(callback, delay);
      timers.add(timer);
      return timer;
    };
    const play = () => {
      setLanes({
        cerebras: completionDemoLane("cerebras"),
        openrouter: completionDemoLane("openrouter")
      });
      later(() => setLanes((current) => ({
        ...current,
        cerebras: { ...current.cerebras, status: "complete", elapsedMs: 8700 }
      })), 550);
      later(() => setLanes((current) => ({
        ...current,
        openrouter: { ...current.openrouter, status: "complete", elapsedMs: 56000 }
      })), 1550);
    };

    play();
    loop = window.setInterval(play, completionDemoLoopMs);
    return () => {
      window.clearInterval(loop);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [completionDemo, completionDemoLoopMs]);

  useEffect(() => {
    if (!Object.values(lanes).some((lane) => lane.status === "running")) return undefined;
    const timer = window.setInterval(() => {
      setLanes((current) => Object.fromEntries(Object.entries(current).map(([laneId, lane]) => [
        laneId,
        lane.status === "running" ? { ...lane, elapsedMs: performance.now() - startedAt.current[laneId] } : lane
      ])));
    }, 100);
    return () => window.clearInterval(timer);
  }, [lanes.cerebras.status, lanes.openrouter.status]);

  useEffect(() => {
    if (completionDemo || completionNotified.current) return;
    if (lanes.cerebras.status !== "complete" || lanes.openrouter.status !== "complete") return;
    completionNotified.current = true;
    onReviewComplete?.();
  }, [completionDemo, lanes.cerebras.status, lanes.openrouter.status, onReviewComplete]);

  function updateLane(laneId, updater) {
    setLanes((current) => ({ ...current, [laneId]: updater(current[laneId]) }));
  }

  async function runLane(laneId) {
    startedAt.current[laneId] = performance.now();
    let attempt = 0;
    while (true) {
      try {
        let completed = false;
        const response = await fetch(`/api/analyze?lane=${laneId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challenge: CHALLENGE, skipInitialAssessment: true })
        });
        await readNdjson(response, (event) => {
          if (event.type === "stage_start") {
            const step = STEPS.find((item) => item.id === event.stage);
            updateLane(laneId, (lane) => ({ ...lane, activeStep: step || { id: event.stage, label: event.label }, error: "" }));
          }
          if (event.type === "stage_result") {
            const stepIndex = STEPS.findIndex((item) => item.id === event.stage);
            const step = STEPS[stepIndex] || { id: event.stage, label: event.label };
            updateLane(laneId, (lane) => ({
              ...lane,
              messages: [...lane.messages.filter((message) => message.stage !== event.stage), {
                stage: event.stage,
                step: stepIndex + 1,
                label: step.label,
                text: messageCopy(event.stage, event.result)
              }]
            }));
          }
          if (event.type === "result") {
            completed = true;
            updateLane(laneId, (lane) => ({
              ...lane,
              status: "complete",
              activeStep: null,
              error: "",
              elapsedMs: event.elapsedMs || performance.now() - startedAt.current[laneId]
            }));
          }
          if (event.type === "error") throw new Error(event.message);
        });
        if (!completed) throw new Error("The review stream ended before completion.");
        return;
      } catch (caught) {
        const delay = LANE_RETRY_DELAYS_MS[Math.min(attempt, LANE_RETRY_DELAYS_MS.length - 1)];
        console.warn(`[qwen-sec-review] ${laneId} attempt ${attempt + 1} failed; retrying in ${delay}ms`, caught);
        attempt += 1;
        updateLane(laneId, (lane) => ({
          ...lane,
          status: "running",
          error: "",
          elapsedMs: performance.now() - startedAt.current[laneId]
        }));
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
    }
  }

  async function startReview() {
    if (reviewStarted.current) return;
    reviewStarted.current = true;
    completionNotified.current = false;
    setLanes({
      cerebras: { ...newLane(), status: "running" },
      openrouter: { ...newLane(), status: "running" }
    });
    await Promise.all([runLane("cerebras"), runLane("openrouter")]);
  }

  return <div className="qchat-app">
    {(showChat || scene === "chat") && <ChatScreen lanes={lanes} prompt={prompt} />}
    {scene === "scan" && <DocumentScan progress={scanProgress} exiting={scanExiting} />}
    {showIntro && <PromptScene
      prompt={prompt}
      attachments={ATTACHMENTS}
      theme="orange"
      onSend={() => {
        if (!skipDocumentScene) setScene("scan");
      }}
      onComplete={() => {
        setShowIntro(false);
        if (skipDocumentScene) {
          setShowChat(true);
          setScene("chat");
        }
      }}
    />}
  </div>;
}
