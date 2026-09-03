import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "../../shared/quant-base.css";
import { PromptIntro } from "../../shared/PromptIntro.jsx";
import cerebrasLogo from "../../../car-damage/public/assets/cerebras-logo.png";
import qwenLogo from "./assets/qwen-logo.png";
import "./qwen-sec-chat.css";

const PROMPT = "Analyze the attached 81-page SEC filing and determine whether the valuation evidence establishes that the $28 offer is fair.";
const CHALLENGE = "Management says the revised projections are more reliable, and the $28 offer falls inside the revised DCF range. Does that make the transaction fair?";
const ATTACHMENTS = [
  { src: "/api/example/page/1", alt: "Transaction filing cover" },
  { src: "/api/example/page/41", alt: "Sale process evidence" },
  { src: "/api/example/page/45", alt: "Valuation range evidence" }
];
const INSPECT_PAGES = [1, 37, 41, 44, 45];
const TOTAL_PAGES = 81;
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
  { id: "assessment", label: "Initial assessment" },
  { id: "challenge", label: "Conclusion" }
];

const LANE_META = {
  cerebras: { name: "Cerebras (WSE)", tone: "orange" },
  openrouter: { name: "GPU Inference", tone: "neutral" }
};

function newLane() {
  return { messages: [], activeStep: null, status: "idle", error: "", elapsedMs: 0 };
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
    assessment: result.conclusion || result.headline,
    challenge: result.answer || result.revised_conclusion
  };
  return concise(fields[stageId], stageId === "challenge" ? 3 : 2, stageId === "challenge" ? 540 : 380);
}

function formatClock(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatRaceClock(milliseconds) {
  const safeMs = Math.max(0, Math.round(milliseconds || 0));
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const tenths = Math.floor((safeMs % 1000) / 100);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function formatSpeedRatio(firstMilliseconds, secondMilliseconds) {
  const faster = Math.max(1, Math.min(firstMilliseconds, secondMilliseconds));
  const slower = Math.max(firstMilliseconds, secondMilliseconds);
  return `${(slower / faster).toFixed(1)}x`;
}

const pick = (items) => items[Math.floor(Math.random() * items.length)];

function createConfettiPieces(baseDelay) {
  return Array.from({ length: 15 }, (_, id) => {
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

function TimerShowcase({ active, cerebrasMs, gpuMs, onDismiss }) {
  const pillRefs = useRef({});

  useEffect(() => {
    if (!active) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, onDismiss]);

  useLayoutEffect(() => {
    if (!active || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return undefined;
    const animations = [];
    ["cerebras", "openrouter"].forEach((laneId, index) => {
      const pill = pillRefs.current[laneId];
      const source = document.querySelector(`[data-timer="${laneId}"]`);
      if (!pill || !source) return;
      const from = source.getBoundingClientRect();
      const to = pill.getBoundingClientRect();
      const scale = to.height ? from.height / to.height : 1;
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      animations.push(pill.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
          { transform: "translate(0, 0) scale(1)" }
        ],
        { duration: 940, delay: index * 70, easing: "cubic-bezier(.2, .86, .24, 1)", fill: "backwards" }
      ));
    });
    return () => animations.forEach((animation) => animation.cancel());
  }, [active, cerebrasMs, gpuMs]);

  if (!active) return null;

  const fasterLane = cerebrasMs <= gpuMs ? "cerebras" : "openrouter";
  const slots = [
    { laneId: "cerebras", label: "Cerebras (WSE)", milliseconds: cerebrasMs },
    { laneId: "openrouter", label: "GPU Inference", milliseconds: gpuMs }
  ];

  return (
    <div className="qchat-timer-showcase" role="dialog" aria-label="Final review times" onMouseDown={onDismiss}>
      <div className="qchat-timer-showcase-inner" onMouseDown={(event) => event.stopPropagation()}>
        <span className="qchat-showcase-eyebrow">FINAL REVIEW TIMES</span>
        <div className="qchat-showcase-pillrow">
          {slots.map((slot) => (
            <div className={`qchat-showcase-slot ${slot.laneId}${slot.laneId === fasterLane ? " is-faster" : ""}`} key={slot.laneId}>
              <span>{slot.label}</span>
              <b ref={(element) => { pillRefs.current[slot.laneId] = element; }}>{formatRaceClock(slot.milliseconds)}</b>
            </div>
          ))}
        </div>
        <div className={`qchat-showcase-verdict ${fasterLane}`}>
          <strong>{formatSpeedRatio(cerebrasMs, gpuMs)}</strong>
          <span>faster</span>
        </div>
      </div>
    </div>
  );
}

function ChatLane({ laneId, lane, lifting }) {
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
    <section className={`qchat-lane ${meta.tone}${celebrate ? " is-celebrating" : ""}${lifting ? " is-lifting" : ""}`} aria-label={`${meta.name} Qwen 3.8 27B review`}>
      {celebrate && <CerebrasCelebration />}
      <header className="qchat-lane-header">
        <div><strong>{meta.name}</strong><span>Qwen 3.8 27B</span></div>
        {complete ? (
          <div className={`qchat-lane-finish${lifting ? "" : " is-pulsing"}`} aria-label={`Completed in ${formatRaceClock(lane.elapsedMs)}`}>
            <strong>DONE</strong>
            <b data-timer={laneId}>{formatRaceClock(lane.elapsedMs)}</b>
          </div>
        ) : <b className="qchat-lane-clock" data-timer={laneId}>{formatClock(lane.elapsedMs)}</b>}
      </header>

      <section className="qchat-thread" ref={threadRef}>
        <div className="qchat-thread-inner">
          <article className="qchat-message qchat-user">
            <div className="qchat-user-copy">{PROMPT}</div>
            <div className="qchat-attachment">
              <img src="/api/example/page/1" alt="Attached transaction filing" />
              <div><strong>Public transaction filing</strong><span>PDF · 81 pages</span></div>
            </div>
          </article>

          {lane.messages.map((message, index) => <AssistantMessage key={message.stage} message={message} index={index} laneId={laneId} />)}
          {running && <ThinkingMessage label={lane.activeStep?.label} laneId={laneId} />}
          {lane.error && <article className="qchat-error"><strong>Review stopped</strong><span>{lane.error}</span></article>}
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
    </section>
  );
}

function ChatScreen({ lanes }) {
  const completed = Object.values(lanes).reduce((total, lane) => total + lane.messages.length, 0);
  const running = Object.values(lanes).some((lane) => lane.status === "running");
  const bothFinished = lanes.cerebras.status === "complete" && lanes.openrouter.status === "complete";
  const [showcase, setShowcase] = useState(false);
  const [showcaseDismissed, setShowcaseDismissed] = useState(false);

  useEffect(() => {
    if (!bothFinished) {
      setShowcase(false);
      setShowcaseDismissed(false);
      return undefined;
    }
    if (showcaseDismissed) return undefined;
    const timeout = window.setTimeout(() => setShowcase(true), 850);
    return () => window.clearTimeout(timeout);
  }, [bothFinished, showcaseDismissed]);

  return (
    <main className="qchat-chat q-dot-field" aria-label="Qwen 3.8 27B side-by-side SEC filing review">
      <header className="qchat-topbar">
        <div className="qchat-wordmark"><CerebrasMark /><strong>Qwen 3.8 27B</strong></div>
        <div className="qchat-thread-title"><strong>SEC Filing Review</strong><span>Side-by-side model comparison</span></div>
        <div className="qchat-run-status">{running ? "Reviewing" : completed === STEPS.length * 2 ? "Complete" : "Ready"}</div>
      </header>
      <section className="qchat-lanes">
        <ChatLane laneId="cerebras" lane={lanes.cerebras} lifting={showcase} />
        <ChatLane laneId="openrouter" lane={lanes.openrouter} lifting={showcase} />
      </section>
      <footer className="qchat-legal">Uses publicly available financial documents. AI-generated analysis may be inaccurate and is not investment advice.</footer>
      <TimerShowcase
        active={showcase}
        cerebrasMs={lanes.cerebras.elapsedMs}
        gpuMs={lanes.openrouter.elapsedMs}
        onDismiss={() => {
          setShowcase(false);
          setShowcaseDismissed(true);
        }}
      />
    </main>
  );
}

export function QwenSecChatReview({ skipDocumentScene = false }) {
  const skipIntro = useMemo(() => new URLSearchParams(window.location.search).get("intro") === "0", []);
  const [showIntro, setShowIntro] = useState(!skipIntro);
  const [scene, setScene] = useState(skipIntro ? (skipDocumentScene ? "chat" : "scan") : "prompt");
  const [scanProgress, setScanProgress] = useState(0);
  const [scanExiting, setScanExiting] = useState(false);
  const [showChat, setShowChat] = useState(skipIntro && skipDocumentScene);
  const [lanes, setLanes] = useState({ cerebras: newLane(), openrouter: newLane() });
  const startedAt = useRef({});
  const reviewStarted = useRef(false);

  useEffect(() => {
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
  }, [scene]);

  useEffect(() => {
    if (!skipDocumentScene || showIntro || scene !== "chat") return undefined;
    const timer = window.setTimeout(() => void startReview(), 500);
    return () => window.clearTimeout(timer);
  }, [skipDocumentScene, showIntro, scene]);

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

  function updateLane(laneId, updater) {
    setLanes((current) => ({ ...current, [laneId]: updater(current[laneId]) }));
  }

  async function runLane(laneId) {
    startedAt.current[laneId] = performance.now();
    try {
      const response = await fetch(`/api/analyze?lane=${laneId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge: CHALLENGE })
      });
      await readNdjson(response, (event) => {
        if (event.type === "stage_start") {
          const step = STEPS.find((item) => item.id === event.stage);
          updateLane(laneId, (lane) => ({ ...lane, activeStep: step || { id: event.stage, label: event.label } }));
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
          updateLane(laneId, (lane) => ({
            ...lane,
            status: "complete",
            activeStep: null,
            elapsedMs: event.elapsedMs || performance.now() - startedAt.current[laneId]
          }));
        }
        if (event.type === "error") throw new Error(event.message);
      });
    } catch (caught) {
      updateLane(laneId, (lane) => ({
        ...lane,
        status: "error",
        activeStep: null,
        error: caught.message || "The review could not be completed."
      }));
    }
  }

  async function startReview() {
    if (reviewStarted.current) return;
    reviewStarted.current = true;
    setLanes({
      cerebras: { ...newLane(), status: "running" },
      openrouter: { ...newLane(), status: "running" }
    });
    await Promise.all([runLane("cerebras"), runLane("openrouter")]);
  }

  return <div className="qchat-app">
    {(showChat || scene === "chat") && <ChatScreen lanes={lanes} />}
    {scene === "scan" && <DocumentScan progress={scanProgress} exiting={scanExiting} />}
    {showIntro && <PromptIntro
      prompt={PROMPT}
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
