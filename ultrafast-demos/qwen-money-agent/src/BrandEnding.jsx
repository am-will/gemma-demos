import React, { useEffect, useRef, useState } from "react";
import "./brand-ending.css";

const RATE_START_DELAY_MS = 850;
const RATE_DURATION_MS = 1050;
const MODEL_STAGE_LINGER_MS = 1500;

export function BrandEndingOverlay({ variant, sequenceKey }) {
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
        setRate(Math.round(eased * 16));
        if (progress < 1) frameRef.current = window.requestAnimationFrame(tick);
      };
      frameRef.current = window.requestAnimationFrame(tick);
    }, RATE_START_DELAY_MS);
    later(() => setShowCerebras(true), 2100);
    later(() => setPhase("divider"), 3600 + MODEL_STAGE_LINGER_MS);
    later(() => setPhase("brands"), 4050 + MODEL_STAGE_LINGER_MS);

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
            <span>Up to <b>{rate}</b>x faster than GPUs</span>
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

        </>
      )}
    </section>
  );
}

