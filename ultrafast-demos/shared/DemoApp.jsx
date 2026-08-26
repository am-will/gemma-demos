import React, { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

const LANES = [
  { id: "standard", label: "Standard", detail: "Default service tier" },
  { id: "ultrafast", label: "Ultrafast", detail: "Powered by Cerebras" }
];

const EMPTY_LANE = {
  status: "idle",
  phase: "initial",
  stage: -1,
  artifact: null,
  elapsedMs: 0,
  serviceTier: null,
  error: null,
  queued: false
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function formatTime(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function ModeSwitch({ mode, setMode, liveAvailable, disabled }) {
  return (
    <div className="mode-switch" aria-label="Run mode">
      <button className={mode === "replay" ? "active" : ""} disabled={disabled} onClick={() => setMode("replay")}>Demo</button>
      <button
        className={mode === "live" ? "active" : ""}
        disabled={disabled || !liveAvailable}
        onClick={() => setMode("live")}
        title={liveAvailable ? "Run measured API requests" : "Requires OPENAI_API_KEY and Ultrafast preview access"}
      >
        Live API
      </button>
    </div>
  );
}

function Progress({ scenario, lane }) {
  if (lane.status === "idle") return <span className="progress-copy">Waiting for the event</span>;
  if (lane.status === "error") return <span className="progress-copy error-copy">Request failed</span>;
  if (lane.status === "complete") return <span className="progress-copy done-copy">Decision brief updated</span>;
  const label = scenario.stages[Math.max(0, lane.stage)] || "Starting investigation";
  return (
    <div className="progress-line">
      <span className="pulse-dot" />
      <span>{label}</span>
      {lane.queued && <strong>NEW EVIDENCE QUEUED</strong>}
    </div>
  );
}

function Artifact({ scenario, artifact, isRevised, onApprove, approved, showApproval }) {
  if (!artifact) {
    return (
      <div className="artifact-empty">
        <div className="scan-line" />
        <p>{scenario.emptyState}</p>
      </div>
    );
  }

  return (
    <article className={`artifact ${isRevised ? "revised" : ""}`}>
      <div className="artifact-heading">
        <div>
          <span className="artifact-kicker">{scenario.artifactLabel}</span>
          <h2>{artifact.headline}</h2>
        </div>
        <span className="confidence">{artifact.confidence}% confidence</span>
      </div>

      {artifact.change && (
        <div className="change-strip">
          <span>CONCLUSION CHANGED</span>
          <strong>{artifact.change}</strong>
        </div>
      )}

      <p className="artifact-summary">{artifact.summary}</p>

      <div className="metrics">
        {artifact.metrics.map((metric) => (
          <div className={`metric ${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>

      <div className="brief-grid">
        <section>
          <span>{scenario.sectionLabels[0]}</span>
          <p>{artifact.primaryFinding}</p>
        </section>
        <section>
          <span>{scenario.sectionLabels[1]}</span>
          <p>{artifact.impact}</p>
        </section>
        <section>
          <span>{scenario.sectionLabels[2]}</span>
          <p>{artifact.nextAction}</p>
        </section>
      </div>

      <footer className="artifact-footer">
        <div className="sources">
          {artifact.sources.map((source) => <span key={source}>{source}</span>)}
        </div>
        {scenario.approvalLabel && isRevised && showApproval && (
          <button className={`approval-button ${approved ? "approved" : ""}`} onClick={onApprove}>
            {approved ? "Approval recorded" : scenario.approvalLabel}
          </button>
        )}
      </footer>
    </article>
  );
}

function Lane({ definition, scenario, lane, mode, onApprove, approved }) {
  const isUltrafast = definition.id === "ultrafast";
  return (
    <section className={`lane ${isUltrafast ? "ultrafast" : "standard"}`}>
      <header className="lane-header">
        <div>
          <div className="lane-title-row">
            {isUltrafast && <img src="/assets/cerebras-logo.png" alt="" />}
            <h2>{definition.label}</h2>
          </div>
          <p>GPT-5.6 Sol · {definition.detail}</p>
        </div>
        <div className="lane-time">
          <span>{mode === "live" ? "MEASURED" : "REPLAY CLOCK"}</span>
          <strong>{formatTime(lane.elapsedMs)}</strong>
          {lane.serviceTier && <small>API: {lane.serviceTier}</small>}
        </div>
      </header>
      <div className="lane-progress"><Progress scenario={scenario} lane={lane} /></div>
      {lane.error && <div className="lane-error">{lane.error}</div>}
      <Artifact
        scenario={scenario}
        artifact={lane.artifact}
        isRevised={lane.phase === "revised" && lane.status === "complete"}
        onApprove={onApprove}
        approved={approved}
        showApproval={isUltrafast}
      />
    </section>
  );
}

export function DemoApp({ scenario }) {
  const [mode, setMode] = useState("replay");
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [lanes, setLanes] = useState({ standard: { ...EMPTY_LANE }, ultrafast: { ...EMPTY_LANE } });
  const [running, setRunning] = useState(false);
  const [evidenceActive, setEvidenceActive] = useState(false);
  const [approved, setApproved] = useState(false);
  const runIdRef = useRef(0);
  const evidenceRef = useRef(false);
  const laneStateRef = useRef(lanes);

  useEffect(() => { laneStateRef.current = lanes; }, [lanes]);
  useEffect(() => {
    fetch("/api/status")
      .then((response) => response.json())
      .then((status) => setLiveAvailable(Boolean(status.liveAvailable)))
      .catch(() => setLiveAvailable(false));
  }, []);

  const allComplete = useMemo(
    () => LANES.every(({ id }) => lanes[id].status === "complete" && lanes[id].phase === (evidenceActive ? "revised" : "initial")),
    [lanes, evidenceActive]
  );

  useEffect(() => {
    if (running && allComplete) setRunning(false);
  }, [allComplete, running]);

  const patchLane = (id, patch) => {
    setLanes((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  async function runReplayLane(id, phase, runId) {
    const durations = scenario.replay[id][phase];
    const artifact = scenario.artifacts[phase];
    const startedAt = performance.now();
    patchLane(id, { status: "running", phase, stage: 0, error: null, queued: false, elapsedMs: 0 });

    for (let stage = 0; stage < scenario.stages.length; stage += 1) {
      if (runIdRef.current !== runId) return;
      patchLane(id, { stage, elapsedMs: Math.round(performance.now() - startedAt) });
      await wait(durations[stage]);
    }
    if (runIdRef.current !== runId) return;
    patchLane(id, {
      status: "complete",
      artifact,
      elapsedMs: durations.reduce((total, duration) => total + duration, 0),
      queued: false
    });

    if (phase === "initial" && evidenceRef.current) {
      await runReplayLane(id, "revised", runId);
    }
  }

  async function runLiveLane(id, phase, runId, previous = null) {
    const startedAt = performance.now();
    patchLane(id, { status: "running", phase, stage: 0, error: null, queued: false, elapsedMs: 0 });
    const ticker = setInterval(() => {
      if (runIdRef.current !== runId) return;
      const elapsedMs = Math.round(performance.now() - startedAt);
      const stage = Math.min(scenario.stages.length - 1, Math.floor(elapsedMs / 1400));
      patchLane(id, { elapsedMs, stage });
    }, 80);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: id, phase, previous })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Request failed");
      if (runIdRef.current !== runId) return;
      patchLane(id, {
        status: "complete",
        artifact: payload.result,
        elapsedMs: payload.elapsedMs,
        serviceTier: payload.serviceTier,
        stage: scenario.stages.length - 1,
        queued: false
      });
      if (phase === "initial" && evidenceRef.current) {
        await runLiveLane(id, "revised", runId, payload.result);
      }
    } catch (error) {
      patchLane(id, { status: "error", error: error.message, elapsedMs: Math.round(performance.now() - startedAt) });
    } finally {
      clearInterval(ticker);
    }
  }

  function start() {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    evidenceRef.current = false;
    setEvidenceActive(false);
    setApproved(false);
    setRunning(true);
    setLanes({ standard: { ...EMPTY_LANE }, ultrafast: { ...EMPTY_LANE } });

    for (const { id } of LANES) {
      if (mode === "live") runLiveLane(id, "initial", runId);
      else runReplayLane(id, "initial", runId);
    }
  }

  function injectEvidence() {
    if (evidenceRef.current) return;
    evidenceRef.current = true;
    setEvidenceActive(true);
    setRunning(true);
    setApproved(false);
    const runId = runIdRef.current;

    for (const { id } of LANES) {
      const lane = laneStateRef.current[id];
      if (lane.status === "complete" && lane.phase === "initial") {
        if (mode === "live") runLiveLane(id, "revised", runId, lane.artifact);
        else runReplayLane(id, "revised", runId);
      } else if (lane.phase === "initial") {
        patchLane(id, { queued: true });
      }
    }
  }

  const canInject = lanes.ultrafast.status === "complete" && lanes.ultrafast.phase === "initial" && !evidenceActive;

  return (
    <main className={`demo-shell theme-${scenario.theme}`}>
      <header className="topbar">
        <a className="brand" href="https://www.cerebras.ai" target="_blank" rel="noreferrer">
          <img src="/assets/cerebras-logo.png" alt="Cerebras" />
          <span>CEREBRAS</span>
        </a>
        <div className="model-mark">OPENAI · GPT-5.6 SOL</div>
        <ModeSwitch mode={mode} setMode={setMode} liveAvailable={liveAvailable} disabled={running} />
      </header>

      <section className="hero">
        <div>
          {scenario.eyebrow && <p className="eyebrow">{scenario.eyebrow}</p>}
          <h1>{scenario.title}</h1>
        </div>
        <p className="hero-copy">{scenario.subtitle}</p>
      </section>

      <section className="event-bar">
        <div className="event-copy">
          <span>{evidenceActive ? "NEW EVIDENCE" : "LIVE EVENT"}</span>
          <strong>{evidenceActive ? scenario.newEvidence : scenario.trigger}</strong>
        </div>
        {!running && lanes.ultrafast.status === "idle" && <button className="primary-action" onClick={start}>Start analysis</button>}
        {canInject && <button className="evidence-action" onClick={injectEvidence}>Add new evidence</button>}
        {allComplete && evidenceActive && <button className="secondary-action" onClick={start}>Replay</button>}
        {running && !canInject && <div className="event-status"><span /> INVESTIGATION ACTIVE</div>}
      </section>

      <section className="comparison" aria-label="Standard and Ultrafast comparison">
        {LANES.map((definition) => (
          <Lane
            key={definition.id}
            definition={definition}
            scenario={scenario}
            lane={lanes[definition.id]}
            mode={mode}
            onApprove={() => setApproved(true)}
            approved={approved}
          />
        ))}
      </section>

    </main>
  );
}
