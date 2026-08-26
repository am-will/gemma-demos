import React, { useEffect, useMemo, useRef, useState } from "react";

export const RUN_SECONDS = 60;

export function useReplay(duration = RUN_SECONDS) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startedAt = useRef(0);
  const playbackRate = useMemo(
    () => (new URLSearchParams(window.location.search).get("speed") === "20" ? 20 : 1),
    []
  );

  useEffect(() => {
    if (!running) return undefined;
    const interval = window.setInterval(() => {
      const next = Math.min(duration, ((performance.now() - startedAt.current) / 1000) * playbackRate);
      setElapsed(next);
      if (next >= duration) setRunning(false);
    }, 50);
    return () => window.clearInterval(interval);
  }, [duration, playbackRate, running]);

  function start() {
    setElapsed(0);
    startedAt.current = performance.now();
    setRunning(true);
  }

  return {
    elapsed,
    running,
    finished: elapsed >= duration,
    remaining: Math.max(0, duration - elapsed),
    start
  };
}

export function formatClock(seconds) {
  return `00:${String(Math.max(0, Math.ceil(seconds))).padStart(2, "0")}`;
}

export function completedAt(elapsed, milestones) {
  return milestones.filter((time) => elapsed >= time).length;
}

export function CerebrasBrand() {
  return (
    <div className="q-brand">
      <img src="/assets/cerebras-logo.png" alt="Cerebras" />
      <span>CEREBRAS</span>
    </div>
  );
}

export function QuantTopbar({ label, remaining, deadlineLabel }) {
  return (
    <header className="q-topbar">
      <CerebrasBrand />
      <div className="q-model-mark">GPT-5.6 SOL</div>
      <div className="q-deadline">
        <span>{deadlineLabel}</span>
        <strong className={remaining <= 10 ? "urgent" : ""}>{formatClock(remaining)}</strong>
        <small>{label}</small>
      </div>
    </header>
  );
}

export function LaneHeader({ lane, complete, total, unit = "steps" }) {
  const isUltra = lane === "ultrafast";
  return (
    <>
      <header className="q-lane-header">
        <div className="q-tier">
          {isUltra && <img src="/assets/cerebras-logo.png" alt="" />}
          <div>
            <span>{isUltra ? "ULTRAFAST" : "STANDARD"}</span>
            <strong>GPT-5.6 Sol</strong>
          </div>
        </div>
        <div className="q-progress-copy">
          <span>{complete === total ? "COMPLETE" : "IN PROGRESS"}</span>
          <strong>{complete}/{total} {unit}</strong>
        </div>
      </header>
      <div className="q-progress-track"><span style={{ width: `${Math.min(100, (complete / total) * 100)}%` }} /></div>
    </>
  );
}

export function TaskRail({ tasks, completed, lane, lockedAfter = Infinity, evidenceActive = true }) {
  return (
    <aside className="q-task-rail">
      <div className="q-rail-title"><span>REASONING CHAIN</span><strong>{completed}/{tasks.length}</strong></div>
      <div className="q-tasks">
        {tasks.map((task, index) => {
          const done = index < completed;
          const active = index === completed;
          const locked = index >= lockedAfter && !evidenceActive;
          return (
            <div className={`q-task ${done ? "done" : ""} ${active ? "active" : ""} ${locked ? "locked" : ""}`} key={task.label}>
              <span className="q-task-index">{done ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <div>
                <span>{task.kind}</span>
                <strong>{task.label}</strong>
                <small>{task.detail}</small>
              </div>
              {active && <i className={`q-spinner ${lane}`} />}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

export function ReplayButton({ replay, idleLabel = "Start 60s demo" }) {
  return (
    <button className="q-start" onClick={replay.start} disabled={replay.running}>
      {replay.running ? "Demo running" : replay.finished ? "Replay full 60s" : idleLabel}
    </button>
  );
}
