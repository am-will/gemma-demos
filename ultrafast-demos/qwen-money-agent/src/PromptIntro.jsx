import { typingDelay } from "./typing-timing";
import React, { useEffect, useRef, useState } from 'react';
import '../../shared/circular-dot-field.css';
import './prompt-intro.css';


export function PromptIntro({ prompt, ready, error, targetRef, onDock, onComplete }) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState('typing');
  const panel = useRef(null);
  const callbacks = useRef({ onDock, onComplete });
  callbacks.current = { onDock, onComplete };
  const reduced = useRef(matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    let index = 0, timer;
    const type = () => {
      index += reduced.current ? prompt.length : 1;
      setText(prompt.slice(0, index));
      if (index < prompt.length) timer = setTimeout(type, typingDelay(index));
      else setPhase('ready');
    };
    timer = setTimeout(type, 650);
    return () => clearTimeout(timer);
  }, [prompt]);

  useEffect(() => {
    if (phase !== 'ready' || !ready) return;
    const timer = setTimeout(() => setPhase('docking'), 700);
    return () => clearTimeout(timer);
  }, [phase, ready]);
  useEffect(() => {
    const transitions = {
      docked: ['aiming', 650],
      aiming: ['pressing', 800],
      pressing: ['sent', 180],
    };
    if (phase === 'sent') {
      callbacks.current.onComplete();
      return;
    }
    const next = transitions[phase];
    if (!next) return;
    const timer = setTimeout(() => setPhase(next[0]), reduced.current ? 80 : next[1]);
    return () => clearTimeout(timer);
  }, [phase]);
  useEffect(() => {
    if (phase !== 'docking') return;
    callbacks.current.onDock();
    const from = panel.current.getBoundingClientRect();
    const to = targetRef.current.getBoundingClientRect();
    const animation = panel.current.animate([
      { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, transform: 'none' },
      { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, transform: 'none', padding: '15px', borderRadius: '16px', fontSize: '13px' },
    ], { duration: reduced.current ? 1 : 1100, easing: 'cubic-bezier(.22,.8,.25,1)', fill: 'forwards' });
    animation.onfinish = () => {
      animation.commitStyles();
      setPhase('docked');
    };
    return () => { animation.onfinish = null; animation.cancel(); };
  }, [phase, targetRef]);

  return <div className={`money-intro phase-${phase}${['docked', 'aiming', 'pressing', 'sent'].includes(phase) ? ' is-docked' : ''}`}>
    <div className="money-intro-field q-dot-field" />
    <section ref={panel} className="money-intro-composer" aria-label="Opening prompt">
      <div className="money-intro-text">{text}{phase === 'typing' && <i className="money-intro-caret" />}</div>
      {error && <p className="money-intro-error">{error}</p>}
      <button aria-label="Send opening prompt" disabled={!ready || phase === 'typing'} onClick={() => { if (phase === 'docked') setPhase('aiming'); }} className="money-intro-send">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <svg className="money-intro-pointer" viewBox="0 0 26 32" aria-hidden="true"><path d="M3 2L3 25L9 19L14 29L19 27L14 17L23 17Z" fill="#222" stroke="white" strokeWidth="1.7" /></svg>
    </section>
  </div>;
}
