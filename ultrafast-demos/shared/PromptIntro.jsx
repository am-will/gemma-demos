import React, { useEffect, useRef, useState } from "react";
import addIcon from "./prompt-assets/add.svg";
import "./prompt-intro.css";

export function PromptIntro({ prompt, attachments = [], onSend, onComplete, typingDuration = 3200, theme = "neutral" }) {
  const [typedCharacters, setTypedCharacters] = useState(0);
  const [phase, setPhase] = useState("typing");
  const onCompleteRef = useRef(onComplete);
  const onSendRef = useRef(onSend);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduceMotion ? 60 : typingDuration;
    const startedAt = performance.now();
    const aimingAt = duration + (reduceMotion ? 0 : 220);
    const pressingAt = aimingAt + (reduceMotion ? 20 : 760);
    const sentAt = pressingAt + (reduceMotion ? 20 : 200);
    const completeAt = sentAt + (reduceMotion ? 30 : 650);
    let completed = false;
    let sent = false;

    function advance() {
      const elapsed = performance.now() - startedAt;
      const progress = Math.min(1, elapsed / duration);
      setTypedCharacters(Math.round(prompt.length * progress));
      if (elapsed >= sentAt) setPhase("sent");
      else if (elapsed >= pressingAt) setPhase("pressing");
      else if (elapsed >= aimingAt) setPhase("aiming");
      else setPhase("typing");

      if (!sent && elapsed >= sentAt) {
        sent = true;
        onSendRef.current?.();
      }

      if (!completed && elapsed >= completeAt) {
        completed = true;
        window.clearInterval(interval);
        onCompleteRef.current?.();
      }
    }

    const interval = window.setInterval(advance, reduceMotion ? 10 : 32);
    advance();

    return () => window.clearInterval(interval);
  }, [prompt, typingDuration]);

  const visiblePrompt = prompt.slice(0, typedCharacters);

  return (
    <main className={`prompt-intro prompt-intro--${theme} q-dot-field phase-${phase}`} aria-label="Prompt introduction">
      <section className="prompt-intro__composer">
        <div className="prompt-intro__copy" aria-label={prompt}>
          {visiblePrompt}
          {phase === "typing" && <span className="prompt-intro__caret" aria-hidden="true" />}
        </div>

        <div className="prompt-intro__attachments" aria-label="Attached source documents">
          {attachments.slice(0, 3).map((attachment, index) => (
            <figure key={`${attachment.src}-${index}`} style={{ "--stack-index": index }}>
              <img src={attachment.src} alt={attachment.alt || "Attached source page"} />
            </figure>
          ))}
        </div>

        <img className="prompt-intro__add" src={addIcon} alt="" aria-hidden="true" />
        <div className="prompt-intro__actions">
          <span className="prompt-intro__microphone" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
              <path d="M6.75 11.25a5.25 5.25 0 0 0 10.5 0M12 16.5V21M9 21h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <button type="button" className="prompt-intro__send" aria-label="Send prompt">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <span className="prompt-intro__pointer" aria-hidden="true" />
      </section>
    </main>
  );
}
