import { typingDelay } from "./typing-timing";
import React, { useEffect, useRef, useState } from 'react';

export function FollowUp({ prompt, inputRef, composerRef, busy, onType, onSend }) {
  const [phase, setPhase] = useState('typing');
  const [point, setPoint] = useState(null);
  const callbacks = useRef({ onType, onSend });
  callbacks.current = { onType, onSend };
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    let index = 0, timer;
    const type = () => {
      callbacks.current.onType(prompt.slice(0, ++index));
      if (index < prompt.length) timer = setTimeout(type, typingDelay(index));
      else setPhase('ready');
    };
    type();
    return () => clearTimeout(timer);
  }, [inputRef, prompt]);
  useEffect(() => {
    if (phase !== 'ready' || busy) return;
    const rect = composerRef.current.querySelector('.send-button').getBoundingClientRect();
    setPoint({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    const timer = setTimeout(() => setPhase('aiming'), 400);
    return () => clearTimeout(timer);
  }, [phase, busy, composerRef]);
  useEffect(() => {
    if (phase !== 'aiming' && phase !== 'pressing') return;
    const button = composerRef.current.querySelector('.send-button');
    if (phase === 'pressing') button?.classList.add('demo-pressing');
    const timer = setTimeout(() => {
      if (phase === 'aiming') setPhase('pressing');
      else callbacks.current.onSend();
    }, phase === 'aiming' ? 800 : 180);
    return () => { clearTimeout(timer); button?.classList.remove('demo-pressing'); };
  }, [phase, composerRef]);
  return point && <svg className={`follow-pointer follow-${phase}`} style={{ left: point.x - 3, top: point.y - 2 }} width="26" height="32" viewBox="0 0 26 32" aria-hidden="true"><path d="M3 2L3 25L9 19L14 29L19 27L14 17L23 17Z" fill="#222" stroke="white" strokeWidth="1.7" /></svg>;
}
