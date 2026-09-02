import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../shared/quant-base.css";
import { PromptIntro } from "../../shared/PromptIntro.jsx";
import cerebrasLogo from "../../../car-damage/public/assets/cerebras-logo.png";
import "./qwen-sec-chat.css";

const PROMPT = "Analyze the attached SEC filing and determine whether the valuation evidence establishes that the $28 offer is fair.";
const CHALLENGE = "Management says the revised projections are more reliable, and the $28 offer falls inside the revised DCF range. Does that make the transaction fair?";
const ATTACHMENTS = [
  { src: "/api/example/page/1", alt: "Transaction filing cover" },
  { src: "/api/example/page/41", alt: "Sale process evidence" },
  { src: "/api/example/page/45", alt: "Valuation range evidence" }
];
const SCAN_PAGES = [1, 7, 37, 38, 41, 42, 43, 44, 45];

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

function DocumentScan({ progress, exiting }) {
  const previewIndex = Math.min(SCAN_PAGES.length - 1, Math.floor(progress * SCAN_PAGES.length));
  const previewPage = SCAN_PAGES[previewIndex];

  return (
    <section className={`qchat-scan q-dot-field${exiting ? " is-exiting" : ""}`} aria-label="Scanning the SEC filing">
      <header className="qchat-scan-header">
        <div>
          <span>DOCUMENT REVIEW</span>
          <strong>Reading the filing</strong>
        </div>
        <div className="qchat-scan-meter" aria-label="Document scan progress"><i><b style={{ width: `${Math.round(progress * 100)}%` }} /></i></div>
      </header>

      <div className="qchat-scan-stage">
        <figure className="qchat-scan-document" key={previewPage}>
          <figcaption>Public transaction filing</figcaption>
          <img src={`/api/example/page/${previewPage}`} alt="SEC filing excerpt" />
          {progress > 0 && <i className="qchat-scan-beam" />}
        </figure>
        <div className="qchat-scan-status">
          <span>QWEN IS READING</span>
          <strong>{progress < .4 ? "Mapping the disclosure" : progress < .75 ? "Locating valuation evidence" : "Testing the fairness case"}</strong>
        </div>
      </div>
    </section>
  );
}

function AssistantMessage({ message, index }) {
  const isFinal = message.stage === "challenge";
  return (
    <article className={`qchat-message qchat-assistant${isFinal ? " is-final" : ""}`} style={{ "--message-index": index }}>
      <CerebrasMark />
      <div className="qchat-message-body">
        <div className="qchat-message-meta"><strong>Qwen 3.8 27B</strong>{isFinal && <span>Final answer</span>}</div>
        <h2>{isFinal ? "Does the valuation evidence establish that the $28 offer is fair?" : message.label}</h2>
        <p>{message.text}</p>
      </div>
    </article>
  );
}

function ThinkingMessage({ label }) {
  return (
    <div className="qchat-message qchat-assistant qchat-thinking">
      <CerebrasMark />
      <div><strong>{label || "Reviewing the filing"}</strong><span><i /><i /><i /></span></div>
    </div>
  );
}

function ChatLane({ laneId, lane }) {
  const threadRef = useRef(null);
  const meta = LANE_META[laneId];
  const running = lane.status === "running";

  useEffect(() => {
    const container = threadRef.current;
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [lane.messages, lane.activeStep, lane.error]);

  return (
    <section className={`qchat-lane ${meta.tone}`} aria-label={`${meta.name} Qwen 3.8 27B review`}>
      <header className="qchat-lane-header">
        <div><strong>{meta.name}</strong><span>Qwen 3.8 27B</span></div>
        <b className="qchat-lane-clock">{formatClock(lane.elapsedMs)}</b>
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

          {lane.messages.map((message, index) => <AssistantMessage key={message.stage} message={message} index={index} />)}
          {running && <ThinkingMessage label={lane.activeStep?.label} />}
          {lane.error && <article className="qchat-error"><strong>Review stopped</strong><span>{lane.error}</span></article>}
        </div>
      </section>

      <footer className="qchat-composer-wrap">
        <div className="qchat-composer">
          <div className="qchat-composer-input">Ask a follow-up</div>
          <div className="qchat-composer-tools">
            <button type="button" aria-label="Attach a file">+</button>
            <div className="qchat-model"><CerebrasMark /><span><strong>Qwen 3.8 27B</strong><small>{running ? "Analyzing" : "Ready"}</small></span><i /></div>
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

  return (
    <main className="qchat-chat q-dot-field" aria-label="Qwen 3.8 27B side-by-side SEC filing review">
      <header className="qchat-topbar">
        <div className="qchat-wordmark"><CerebrasMark /><strong>Qwen 3.8 27B</strong></div>
        <div className="qchat-thread-title"><strong>SEC Filing Review</strong><span>Side-by-side model comparison</span></div>
        <div className="qchat-run-status">{running ? "Reviewing" : completed === STEPS.length * 2 ? "Complete" : "Ready"}</div>
      </header>
      <section className="qchat-lanes">
        <ChatLane laneId="cerebras" lane={lanes.cerebras} />
        <ChatLane laneId="openrouter" lane={lanes.openrouter} />
      </section>
      <footer className="qchat-legal">Uses publicly available financial documents. AI-generated analysis may be inaccurate and is not investment advice.</footer>
    </main>
  );
}

export function QwenSecChatReview() {
  const skipIntro = useMemo(() => new URLSearchParams(window.location.search).get("intro") === "0", []);
  const [showIntro, setShowIntro] = useState(!skipIntro);
  const [scene, setScene] = useState(skipIntro ? "scan" : "prompt");
  const [scanProgress, setScanProgress] = useState(0);
  const [scanExiting, setScanExiting] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [lanes, setLanes] = useState({ cerebras: newLane(), openrouter: newLane() });
  const startedAt = useRef({});
  const reviewStarted = useRef(false);

  useEffect(() => {
    if (scene !== "scan") return undefined;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduceMotion ? 80 : 720;
    const duration = reduceMotion ? 500 : 5600;
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
    }, reduceMotion ? 16 : 42);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(transitionTimer);
    };
  }, [scene]);

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
      onSend={() => setScene("scan")}
      onComplete={() => setShowIntro(false)}
    />}
  </div>;
}
