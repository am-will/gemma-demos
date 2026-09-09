import React, { useCallback, useEffect, useRef, useState } from "react";
import { QwenSecChatReview } from "../../qwen-sec-chat-review/src/QwenSecChatReview.jsx";
import "./brand-ending.css";

const DONE_HOLD_MS = 3700;
const PREVIEW_BOTH_DONE_MS = 1550;
const PREVIEW_ENDING_START_MS = PREVIEW_BOTH_DONE_MS + DONE_HOLD_MS;
const PREVIEW_LOOP_MS = 12000;
const RATE_START_DELAY_MS = 850;
const RATE_DURATION_MS = 1050;

function BrandEndingOverlay({ variant, sequenceKey }) {
  const [phase, setPhase] = useState("model");
  const [rate, setRate] = useState(0);
  const [showCerebras, setShowCerebras] = useState(false);
  const frameRef = useRef(0);

  useEffect(() => {
    const timers = [];
    const later = (callback, delay) => {
      const timer = window.setTimeout(callback, delay);
      timers.push(timer);
    };

    setPhase("model");
    setRate(0);
    setShowCerebras(false);
    later(() => {
      const started = performance.now();
      const tick = (now) => {
        const progress = Math.min(1, (now - started) / RATE_DURATION_MS);
        const eased = 1 - Math.pow(1 - progress, 4);
        setRate(Math.round(eased * 2000));
        if (progress < 1) frameRef.current = window.requestAnimationFrame(tick);
      };
      frameRef.current = window.requestAnimationFrame(tick);
    }, RATE_START_DELAY_MS);
    later(() => setShowCerebras(true), 2100);
    later(() => setPhase("divider"), 3600);
    later(() => setPhase("brands"), 4050);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.cancelAnimationFrame(frameRef.current);
    };
  }, [sequenceKey]);

  return (
    <section className="qbrand-ending q-dot-field" aria-label="Qwen performance brand ending">
      {phase === "model" && (
        <div className="qbrand-model-stage">
          <h1><span>Qwen 3.8</span><strong>27B</strong></h1>
          <div className="qbrand-throughput">
            <span>up to <b>{rate.toLocaleString("en-US")}</b> tok/s</span>
            <i aria-hidden="true" />
            <img
              className={`qbrand-speed-partner${showCerebras ? " is-visible" : ""}`}
              src="/assets/brand-ending/cerebras-systems-logo-vector.svg"
              alt="Cerebras"
            />
          </div>
        </div>
      )}

      {(phase === "divider" || phase === "brands") && (
        <>
          <div className={`qbrand-brand-stage${phase === "brands" ? " is-revealed" : ""}`}>
            <div className="qbrand-brand-lockup">
              <img className="qbrand-cerebras-logo" src="/assets/brand-ending/cerebras-systems-logo-vector.svg" alt="Cerebras" />
              <i aria-hidden="true" />
              {variant === "2" ? (
                <img className="qbrand-qwen-logo" src="/assets/brand-ending/qwen-standard-horizontal.png" alt="Qwen" />
              ) : (
                <img className="qbrand-alibaba-cloud-logo" src="/assets/brand-ending/alibaba-cloud-horizontal.svg" alt="Alibaba" />
              )}
            </div>
          </div>
          {phase === "brands" && (
            <p className="qbrand-disclaimer">
              Demo conducted on September 3, 2026 using the identified model versions and configurations. Wall-clock
              results reflect a single run and may vary. The interface is purpose-built for this demo; model responses
              are generated live from the same 81-page public filing.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function BrandEndingDemo({ variant = "1" }) {
  const [cycle, setCycle] = useState(0);
  const [showEnding, setShowEnding] = useState(false);

  useEffect(() => {
    setShowEnding(false);
    const endingTimer = window.setTimeout(() => setShowEnding(true), PREVIEW_ENDING_START_MS);
    const loopTimer = window.setTimeout(() => setCycle((value) => value + 1), PREVIEW_LOOP_MS);
    return () => {
      window.clearTimeout(endingTimer);
      window.clearTimeout(loopTimer);
    };
  }, [cycle]);

  return (
    <main className="qbrand-demo">
      <QwenSecChatReview key={`race-${cycle}`} skipDocumentScene completionDemo completionDemoLoopMs={60000} />
      {showEnding && <BrandEndingOverlay key={`ending-${cycle}`} variant={variant} sequenceKey={cycle} />}
    </main>
  );
}

export function LiveBrandEndingDemo({ PromptScene, variant = "2" }) {
  const [endingSequence, setEndingSequence] = useState(0);
  const endingTimerRef = useRef(0);

  const handleReviewComplete = useCallback(() => {
    if (endingTimerRef.current) return;
    endingTimerRef.current = window.setTimeout(() => {
      setEndingSequence((value) => value + 1);
      endingTimerRef.current = 0;
    }, DONE_HOLD_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(endingTimerRef.current), []);

  return (
    <main className="qbrand-demo">
      <QwenSecChatReview
        skipDocumentScene
        PromptScene={PromptScene}
        onReviewComplete={handleReviewComplete}
      />
      {endingSequence > 0 && <BrandEndingOverlay variant={variant} sequenceKey={endingSequence} />}
    </main>
  );
}
