import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../shared/quant-base.css";
import "../../shared/circular-dot-field.css";
import addIcon from "../../shared/prompt-assets/add.svg";
import "./intro-concepts.css";

export const FINANCIAL_ANALYSIS_PROMPT = "Analyze the attached 81-page document and provide a concise financial analysis.";
const PROMPT = FINANCIAL_ANALYSIS_PROMPT;
const CONCEPTS = {
  dock: { number: "01", name: "Dock & snap", note: "Pages arrive from the edge and resolve into one attachment." },
  fan: { number: "02", name: "Fan & bind", note: "A brief page fan makes the PDF feel substantial, then closes." },
  tray: { number: "03", name: "Drag & drop", note: "A cursor grabs the filing, carries it in, and drops it into the tray." }
};
const PAGE_IMAGES = [1, 41, 45];

function useSequence(resetKey, prompt = PROMPT, onSend, onComplete) {
  const [phase, setPhase] = useState("typing");
  const [typed, setTyped] = useState(0);
  const onSendRef = useRef(onSend);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onSendRef.current = onSend;
    onCompleteRef.current = onComplete;
  }, [onComplete, onSend]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const typingDuration = reduced ? 80 : 1900;
    const launchDelayMs = 500;
    const startedAt = performance.now() + launchDelayMs;
    const timers = [];
    let frame;

    setPhase("typing");
    setTyped(0);

    function typeFrame(now) {
      const progress = Math.max(0, Math.min(1, (now - startedAt) / typingDuration));
      setTyped(Math.round(prompt.length * progress));
      if (progress < 1) frame = requestAnimationFrame(typeFrame);
    }

    frame = requestAnimationFrame(typeFrame);
    const schedule = (nextPhase, delay, callback) => timers.push(window.setTimeout(() => {
      setPhase(nextPhase);
      callback?.();
    }, launchDelayMs + (reduced ? 100 : delay)));
    const promptHoldMs = 1200;
    const isFan = resetKey === "fan" || resetKey === "fan-live";
    const attachingAt = isFan ? 2250 : 2050;
    // Fan: 1,025 ms animation plus two 100 ms page staggers.
    const readyAt = isFan ? attachingAt + 1225 : 3000;
    const attachmentShiftMs = readyAt - 3000;
    const aimingAt = (resetKey === "tray" ? 3750 : 3420) + promptHoldMs + attachmentShiftMs;
    const pressingAt = (resetKey === "tray" ? 4350 : 4020) + promptHoldMs + attachmentShiftMs;
    const sentAt = (resetKey === "tray" ? 4540 : 4210) + promptHoldMs + attachmentShiftMs;
    schedule("attaching", attachingAt);
    schedule("ready", readyAt);
    schedule("aiming", aimingAt);
    schedule("pressing", pressingAt);
    schedule("sent", sentAt, () => onSendRef.current?.());
    timers.push(window.setTimeout(() => onCompleteRef.current?.(), launchDelayMs + (reduced ? 140 : sentAt + 700)));

    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [prompt, resetKey]);

  return { phase, typed };
}

function FilePages() {
  return (
    <div className="intro-files" aria-label="81-page SEC filing attachment">
      <div className="intro-drag-stage">
        {PAGE_IMAGES.map((page, index) => (
          <figure key={page} style={{ "--page-index": index }}>
            <img src={`/api/example/page/${page}`} alt="" />
          </figure>
        ))}
      </div>
      <div className="intro-tray" aria-hidden="true"><span>+</span></div>
    </div>
  );
}

function SendButton() {
  return (
    <button className="intro-send" type="button" aria-label="Send prompt">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function ConceptLinks({ conceptId }) {
  return (
    <div className="intro-nav-links">
      {Object.entries(CONCEPTS).map(([id, item]) => (
        <a className={id === conceptId ? "active" : ""} href={`?concept=${id}`} aria-label={`Concept ${item.number}: ${item.name}`} key={id}>
          {Number(item.number)}
        </a>
      ))}
    </div>
  );
}

function ReviewPreview({ conceptId }) {
  return (
    <section className="intro-review-preview" aria-label="Side-by-side review preview">
      <header>
        <div><i>◉</i><strong>Qwen 3.8 27B</strong></div>
        <div className="intro-review-heading">
          <span>SEC Filing Review</span>
          <nav className="intro-review-nav" aria-label="Restart with another intro concept">
            <ConceptLinks conceptId={conceptId} />
          </nav>
        </div>
        <b>READY</b>
      </header>
      <div className="intro-review-lanes">
        {["Cerebras (WSE)", "GPU Inference"].map((label, index) => (
          <article className={index ? "neutral" : "orange"} key={label}>
            <div className="intro-lane-head"><strong>{label}</strong><span>00:00</span></div>
            <p>{PROMPT}</p>
            <div className="intro-mini-file"><i>PDF</i><span><strong>Public transaction filing</strong><small>81 pages</small></span></div>
            <div className="intro-ready-line"><i /><i /><i /><span>Ready to review</span></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PromptComposer({ phase, prompt, typed }) {
  return (
    <section className="intro-composer" aria-label="Prompt composer">
      <div className="intro-copy" aria-label={prompt}>
        <span>
          {prompt.slice(0, typed)}
          {phase === "typing" && <i className="intro-caret" aria-hidden="true" />}
        </span>
      </div>
      <FilePages />
      <div className="intro-bottom-bar">
        <button type="button" className="intro-add" aria-label="Attach a file">
          <img className="intro-add-plus" src={addIcon} alt="" aria-hidden="true" />
          <svg className="intro-add-check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m6.5 12.5 3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="intro-actions">
          <span className="intro-mic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" /><path d="M6.75 11.25a5.25 5.25 0 0 0 10.5 0M12 16.5V21M9 21h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </span>
          <SendButton />
        </div>
      </div>
      <span className="intro-pointer" aria-hidden="true" />
    </section>
  );
}

export function FanPromptIntro({ prompt = PROMPT, onSend, onComplete }) {
  const { phase, typed } = useSequence("fan-live", prompt, onSend, onComplete);

  return (
    <main className={`intro-study q-dot-field concept-fan phase-${phase}`} aria-label="SEC filing review prompt">
      <PromptComposer phase={phase} prompt={prompt} typed={typed} />
    </main>
  );
}

export function IntroConcepts() {
  const requested = useMemo(() => new URLSearchParams(window.location.search).get("concept"), []);
  const conceptId = Object.hasOwn(CONCEPTS, requested) ? requested : "fan";
  const { phase, typed } = useSequence(conceptId);

  return (
    <main className={`intro-study q-dot-field concept-${conceptId} phase-${phase}`}>
      <ReviewPreview conceptId={conceptId} />

      <nav className="intro-nav" aria-label="Intro concepts">
        <ConceptLinks conceptId={conceptId} />
      </nav>

      <PromptComposer phase={phase} prompt={PROMPT} typed={typed} />
    </main>
  );
}
