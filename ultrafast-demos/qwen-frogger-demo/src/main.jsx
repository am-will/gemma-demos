import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import bash from 'highlight.js/lib/languages/bash';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import { BRAND, PROMPT, TIMING } from './config';
import '../../shared/quant-base.css';
import '../../shared/circular-dot-field.css';
import './brand-ending.css';
import './style.css';

Object.entries({ typescript, javascript, css, json, xml, bash, markdown, plaintext }).forEach(([name, grammar]) => hljs.registerLanguage(name, grammar));
const params = new URLSearchParams(location.search);
const allowedScenes = ['intro', 'build', 'done', 'ready', 'showcase', 'ending'];
const requestedScene = allowedScenes.includes(params.get('scene')) ? params.get('scene') : 'intro';
const requestedTime = Math.max(0, Number(params.get('at')) || 0) * 1000;
export const formatTime = ms => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor(ms / 1000 % 60);
  return `${minutes ? `${minutes}:${String(seconds).padStart(2, '0')}` : seconds}.${Math.floor(ms / 100 % 10)}`;
};

const workedTime = ms => `${Math.floor(ms / 60000)}m${Math.floor(ms / 1000 % 60)}s`;

function Arrow() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }

function DemoPointer({ aiming }) { return <span className={`demo-pointer ${aiming ? 'aiming' : ''}`} aria-hidden="true"><svg viewBox="0 0 40 48"><path d="M10 25V7a4 4 0 0 1 8 0v13c0-5 7-5 7 0v2c0-5 7-4 7 1v2c0-4 6-3 6 2v8c0 5-3 9-6 11H17c-3-4-5-7-8-10l-6-7c-4-5 1-9 5-5l5 5" fill="white" stroke="#292722" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>; }

function Intro({ time, onSend }) {
  const sent = time >= TIMING.sendAt;
  const typed = Math.floor(PROMPT.length * Math.max(0, Math.min(1, (time - TIMING.typingStart) / TIMING.typingDuration)));
  return <section className={`prompt-scene q-dot-field ${sent ? 'sent' : ''} ${time >= TIMING.sendAt - .16 ? 'pressing' : ''}`} aria-label="Text prompt introduction">
    <div className="prompt-composer"><div className="prompt-copy" aria-label={PROMPT}><span className="prompt-measure" aria-hidden="true">{PROMPT}</span><span className="prompt-typed" aria-hidden="true">{PROMPT.slice(0, typed)}{typed < PROMPT.length && <i className="caret" />}</span></div>
      <div className="prompt-actions"><span className="intro-model"><img src={`${BRAND}qwen-symbol-transparent.png`} alt="" />Qwen 3.8 27B</span><button aria-label="Send prompt" onClick={onSend} disabled={sent}><Arrow /><span className="send-ripple" aria-hidden="true" /><DemoPointer aiming={time >= TIMING.sendAt - .95} /></button></div>
    </div>
  </section>;
}

function Ending({ time }) {
  const phase = time < TIMING.modelHold ? 'model' : time < TIMING.brandReveal ? 'divider' : 'brands';
  const progress = Math.max(0, Math.min(1, (time - .85) / 1.05));
  const rate = Math.round((1 - (1 - progress) ** 4) * 16);
  return <section className="qbrand-ending q-dot-field" aria-label="Cerebras and Qwen ending">
    {phase === 'model' ? <div className="qbrand-model-stage"><h1><span>Qwen 3.8</span><strong>27B</strong></h1><div className="qbrand-throughput"><span>Up to <b>{rate}</b>x faster than GPUs</span><i /><img className={`qbrand-speed-partner ${time > 2.1 ? 'is-visible' : ''}`} src={`${BRAND}cerebras-systems-logo-vector.svg`} alt="Cerebras" /></div></div>
      : <div className={`qbrand-brand-stage ${phase === 'brands' ? 'is-revealed' : ''}`}><div className="qbrand-brand-lockup"><img className="qbrand-cerebras-logo" src={`${BRAND}cerebras-systems-logo-vector.svg`} alt="Cerebras" /><i /><img className="qbrand-qwen-logo" src={`${BRAND}qwen-standard-horizontal.png`} alt="Qwen" /></div></div>}
    {phase === 'brands' && <p className="qbrand-disclaimer">Platformer game build in OpenCode using Qwen 3.8 27B on Cerebras. The session log was exported and replayed in this custom UI.</p>}
  </section>;
}

const Code = memo(function Code({ text, language = 'plaintext', variant = '' }) {
  if (!text) return null;
  const highlighted = hljs.highlight(text, { language: hljs.getLanguage(language) ? language : 'plaintext', ignoreIllegals: true }).value;
  return <pre className={`code-block ${variant}`}><code dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>;
});

function Message({ text }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part);
}

const ToolCard = memo(function ToolCard({ event, done, revealed, current }) {
  const [opened, setOpened] = useState(null);
  // Keep the bookkeeping plan compact: its brief JSON expansion used to
  // scroll the opening prompt away, then snap back when the next tool arrived.
  const expanded = opened ?? (current && event.tool !== 'todowrite');
  return <article className={`trace-tool ${current ? 'current' : ''} ${event.status === 'error' ? 'has-error' : ''}`} data-tool={event.tool}>
    <button className="tool-heading" onClick={() => setOpened(!expanded)} aria-expanded={expanded}>
      <span className={`tool-symbol ${done ? 'complete' : 'working'}`}>{done ? event.status === 'error' ? '!' : '✓' : '◌'}</span>
      <strong>{event.title}</strong><span className="tool-path">{event.path || (event.tool === 'bash' ? (event.code || '').split('\n')[0] : '')}</span>
      <span className="tool-duration">{done ? `${((event.end - event.start) / 1000).toFixed(1)}s` : 'Running'}</span><span className="chevron">{expanded ? '−' : '+'}</span>
    </button>
    {expanded && <div className="tool-detail">
      {event.before && <div className="diff-section removed"><span className="diff-label">− Before</span><Code text={event.before} language={event.language} /></div>}
      {revealed && <div className={event.before ? 'diff-section added' : ''}>{event.before && <span className="diff-label">+ After</span>}<Code text={event.code} language={event.language} /></div>}
      {done && event.output && <div className="tool-output"><Code text={event.output} /></div>}
      {done && event.truncated && <div className="truncated-note">Output excerpt from the saved session</div>}
    </div>}
  </article>;
});

function AgentIdentity() { return <div className="agent-identity"><img src={`${BRAND}cerebras-systems-logo-vector.svg`} alt="Cerebras" /><span>Qwen 3.8 27B</span></div>; }

function ReplayFeed({ data, time, completed, launchTime, command, launched }) {
  const scroller = useRef(null);
  const follow = useRef(true);
  const events = data.events.filter(e => e.type !== 'activity' && e.start <= time);
  const latestTool = events.findLast(e => e.type === 'tool');
  const last = events.at(-1);
  const activeTool = events.some(e => e.type === 'tool' && e.end > time);
  const launchEvents = launched ? data.launch.events.filter(e => e.start <= launchTime) : [];
  const latestLaunchTool = launchEvents.findLast(e => e.type === 'tool');
  const waiting = !completed && !activeTool && (!last || last.end < time);
  useLayoutEffect(() => {
    if (follow.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [time, completed, launchTime]);
  return <div className="terminal-scroll" ref={scroller} onScroll={e => {
    const el = e.currentTarget;
    follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }}>
    <div className="transcript">
      <div className="initial-request"><span className="entry-label">You</span><p>{PROMPT}</p></div>
      <AgentIdentity />
      {events.map(event => event.type === 'text'
        ? <div className="agent-message" key={event.id}><Message text={event.text} /></div>
        : <ToolCard key={event.id} event={event} done={time >= event.end} revealed={time >= event.revealAt} current={event.id === latestTool?.id} />)}
      {waiting && <div className="thinking"><i /><i /><i /><span>Thinking</span></div>}
      {completed && <div className="build-complete">Worked for {workedTime(data.durationMs)}</div>}
      {launched && <div className="initial-request"><span className="entry-label">You</span><p>{command || 'Run the game'}</p></div>}
      {launched && <AgentIdentity />}
      {launchEvents.map(event => event.type === 'text'
        ? <div className="agent-message" key={event.id}><Message text={event.text} /></div>
        : <ToolCard key={event.id} event={event} done={launchTime >= event.end} revealed={launchTime >= event.revealAt} current={event.id === latestLaunchTool?.id} />)}
    </div>
  </div>;
}

function App() {
  const [data, setData] = useState(null);
  const [scene, setScene] = useState(requestedScene);
  const [clock, setClock] = useState(0);
  const elapsed = useRef(0);
  const [workTime, setWorkTime] = useState(requestedTime);
  const work = useRef(requestedTime);
  const [paused, setPaused] = useState(false);
  const [command, setCommand] = useState('');
  const [error, setError] = useState('');
  const [gameReady, setGameReady] = useState(false);
  const [run, setRun] = useState(0);
  const [launchTime, setLaunchTime] = useState(0);
  const launchClock = useRef(0);
  const input = useRef(null);
  const game = useRef(null);
  const gameVisible = scene === 'showcase' && data && launchTime >= data.launch.durationMs;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/replay/session.json', { signal: controller.signal }).then(r => {
      if (!r.ok) throw Error('Transcript unavailable. Run python3 scripts/export-session.py and reload.');
      return r.json();
    }).then(result => {
      if (!Array.isArray(result.events) || !Number.isFinite(result.durationMs)) throw Error('The replay file is invalid. Export the session again.');
      setData(result);
      work.current = ['done', 'ready', 'showcase'].includes(requestedScene) ? result.durationMs : Math.min(requestedTime, result.durationMs);
      setWorkTime(work.current);
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, []);

  const go = useCallback(next => {
    elapsed.current = 0; setClock(0); setPaused(false); setScene(next);
    if (next === 'intro') { work.current = 0; setWorkTime(0); setCommand(''); }
    if (next === 'showcase') { launchClock.current = 0; setLaunchTime(0); setGameReady(false); setRun(n => n + 1); }
  }, []);

  const skipReplay = useCallback(() => {
    if (!data) return;
    work.current = data.durationMs; setWorkTime(data.durationMs); setCommand('');
    go('done');
  }, [data, go]);

  const toggleReplay = useCallback(() => {
    setWorkTime(work.current);
    setPaused(value => !value);
  }, []);

  useEffect(() => {
    let frame, previous = performance.now(), rendered = previous;
    function tick(now) {
      const delta = now - previous; previous = now;
      if (!paused && !document.hidden) {
        if (scene === 'showcase' && data) launchClock.current = Math.min(data.launch.durationMs, launchClock.current + delta);
        if (scene === 'build' && data) work.current = Math.min(data.durationMs, work.current + delta);
        if (['intro', 'done', 'ready', 'ending'].includes(scene)) elapsed.current += delta / 1000;
        if (scene === 'intro' && !data) elapsed.current = Math.min(elapsed.current, TIMING.sendAt - 1);
      }
      if (now - rendered >= 32) {
        rendered = now;
        if (scene === 'build') setWorkTime(work.current);
        if (scene === 'showcase') setLaunchTime(launchClock.current);
        if (['intro', 'done', 'ready', 'ending'].includes(scene)) setClock(scene === 'ending' ? Math.min(elapsed.current, TIMING.endingEnd) : elapsed.current);
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene, data, paused]);

  useEffect(() => {
    if (scene === 'intro' && clock >= TIMING.introEnd && data) go('build');
    if (scene === 'build' && data && workTime >= data.durationMs) go('done');
    if (scene === 'done' && clock >= 4) go('ready');
    if (scene === 'ready') {
      setCommand('Run the game'.slice(0, Math.floor(Math.max(0, clock - .4) * 11)));
      if (clock >= 3.25) go('showcase');
    }
  }, [scene, clock, data, workTime, go]);

  useEffect(() => {
    if (scene === 'ready') input.current?.focus();
  }, [scene]);

  useEffect(() => {
    if (!gameVisible) return;
    const timeout = setTimeout(() => { if (!gameReady) setError('The game is taking longer to load. Check WebGL, then reload.'); }, 15000);
    return () => clearTimeout(timeout);
  }, [gameVisible, gameReady]);

  useEffect(() => {
    function receive(event) {
      if (event.origin !== location.origin || event.source !== game.current?.contentWindow) return;
      if (event.data?.type === 'frogger-ready') {
        setGameReady(true);
        game.current.contentWindow.postMessage({ type: 'frogger-demo', action: 'state', active: true, autoplay: true, paused: false }, location.origin);
        game.current.contentWindow.focus();
      }
      if (event.data?.type === 'frogger-skip') skipReplay();
      if (event.data?.type === 'frogger-finish') go('ending');
      if (event.data?.type === 'frogger-error') setError('The game could not initialize WebGL. Reload to try again.');
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [go, skipReplay]);

  useEffect(() => {
    function key(event) {
      if (event.repeat) return;
      if (event.code === 'KeyI' && !event.metaKey && !event.ctrlKey && !event.altKey && data) {
        event.preventDefault();
        skipReplay();
        return;
      }
      if (scene === 'showcase' && event.key.toLowerCase() === 'p') { event.preventDefault(); go('ending'); return; }
      if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (event.key.toLowerCase() === 'r') go('intro');
      if (scene === 'build' && event.code === 'Space') { event.preventDefault(); toggleReplay(); }
      if (scene === 'showcase' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(event.key)) {
        event.preventDefault(); game.current?.contentWindow?.postMessage({ type: 'frogger-demo', action: 'key', key: event.key }, location.origin);
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [scene, data, go, toggleReplay, skipReplay]);

  function launch(event) {
    event.preventDefault();
    if (scene === 'ready' && command.trim()) go('showcase');
  }
  const terminalVisible = ['intro', 'build', 'done', 'ready', 'showcase'].includes(scene);
  return <main className={`demo-shell ${paused ? 'is-paused' : ''}`} data-scene={scene}>
    {terminalVisible && <section className={`replay-workspace q-dot-field ${gameVisible ? 'showing-game' : ''} ${scene === 'intro' ? `intro-terminal ${clock >= TIMING.sendAt ? 'is-revealing' : ''}` : ''}`} inert={scene === 'intro' ? true : undefined} aria-hidden={scene === 'intro' ? true : undefined}>
      <header className="masthead"><img src={`${BRAND}cerebras-systems-logo-vector.svg`} alt="Cerebras" /><div className="masthead-title"><span className="model-label"><img src={`${BRAND}qwen-symbol-transparent.png`} alt="" />Qwen 3.8 27B</span><h1>Build a 2.5D Road Crossing Game</h1></div></header>
      <section className="terminal-window" aria-label="Agent implementation terminal">
        <header className="terminal-heading"><div className="window-dots"><i /><i /><i /></div><span className="workspace-path">~/voxel-crossing</span><div className={`run-state ${['done', 'ready', 'showcase'].includes(scene) ? 'done' : ''}`}>{scene === 'intro' ? 'Ready' : scene === 'build' ? paused ? 'Paused' : null : 'Complete'}</div><div className="work-timer"><span>Time</span><time>{formatTime(workTime)}</time></div></header>
        {data && <ReplayFeed data={data} time={workTime} completed={['done', 'ready', 'showcase'].includes(scene)} launchTime={launchTime} command={command} launched={scene === 'showcase'} />}
        <form className={`terminal-composer ${scene === 'ready' ? 'is-ready' : ''} ${scene === 'ready' && clock >= 3.05 ? 'pressing' : ''}`} onSubmit={launch}>
          <span className="prompt-chevron" aria-hidden="true">›</span><input ref={input} aria-label="Message the agent" autoComplete="off" spellCheck="false" disabled={scene !== 'ready'} value={command} onChange={e => setCommand(e.target.value)} placeholder={scene === 'ready' ? 'Run the game' : scene === 'showcase' ? command : paused ? 'Replay paused' : 'Building your game...'} />
          <span className="composer-model"><img src={`${BRAND}qwen-symbol-transparent.png`} alt="" /><span>Qwen 3.8 27B</span></span>
          {scene === 'build' ? <button type="button" onClick={toggleReplay} aria-label={paused ? 'Resume replay' : 'Stop replay'} title={paused ? 'Resume replay' : 'Stop replay'}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{paused ? <path d="M8 5v14l11-7z" /> : <rect x="6" y="6" width="12" height="12" rx="2" />}</svg></button> : <button type="submit" disabled={scene !== 'ready' || !command.trim()} aria-label="Send message"><Arrow />{scene === 'ready' && <><span className="send-ripple" aria-hidden="true" /><DemoPointer aiming={clock >= 2.3} /></>}</button>}
        </form>
      </section>
      {gameVisible && <section className="game-window" aria-label="Interactive game window"><header><div className="window-dots"><i /><i /><i /></div><strong>Voxel Crossing</strong><span>localhost / play</span></header><div className="game-viewport"><iframe key={run} ref={game} title="Interactive Voxel Crossing" src="/game/index.html?embed=1" allow="autoplay" />{!gameReady && <div className="game-loading">Opening your world…</div>}</div></section>}
    </section>}
    {scene === 'intro' && <Intro time={clock} onSend={() => { if (data) { elapsed.current = TIMING.sendAt; setClock(TIMING.sendAt); } }} />}
    {scene === 'done' && data && <div className="completion-stage" role="status"><div className="completion-card"><strong>DONE</strong><b>{workedTime(data.durationMs)}</b></div></div>}
    {scene === 'ending' && <Ending time={clock} />}
    {error && <div className="error-message" role="alert">{error}<button onClick={() => location.reload()}>Reload</button></div>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
