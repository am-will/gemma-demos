import React, { useEffect, useMemo, useRef, useState } from "react";
import "./earnings.css";

const TASKS = [
  { kind: "TOOL", label: "Parse earnings release", detail: "release.pdf · 34 pages" },
  { kind: "TOOL", label: "Pull consensus estimates", detail: "consensus.xlsx · 18 metrics" },
  { kind: "CALC", label: "Reconcile reported KPIs", detail: "actual vs street vs internal" },
  { kind: "MODEL", label: "Compare guidance language", detail: "Q1 call · Q2 release" },
  { kind: "CALC", label: "Update operating model", detail: "FY26 revenue + margin" },
  { kind: "MODEL", label: "Draft supported thesis", detail: "citations required" },
  { kind: "LIVE", label: "Ingest new disclosure", detail: "transcript · 14:32" },
  { kind: "CALC", label: "Normalize pull-forward", detail: "$28M timing adjustment" },
  { kind: "CALC", label: "Re-run FY model", detail: "12 dependent formulas" },
  { kind: "VERIFY", label: "Verify claims and sources", detail: "4 material citations" },
  { kind: "ARTIFACT", label: "Update briefing slide", detail: "analyst question included" }
];

const ULTRA_MILESTONES = [3, 6, 9, 13, 17, 21, 28, 33, 38, 43, 47];
const STANDARD_MILESTONES = [12, 26, 44, 64, 84, 106, 120, 140, 160, 181, 198];
const RUN_SECONDS = 60;
const EVIDENCE_SECOND = 24;

function formatClock(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `00:${String(safe).padStart(2, "0")}`;
}

function TaskRail({ completed, evidenceActive, lane }) {
  return (
    <div className="task-rail">
      <div className="task-rail-title">
        <span>DECISION LOOP</span>
        <strong>{completed}/{TASKS.length}</strong>
      </div>
      <div className="tasks">
        {TASKS.map((task, index) => {
          const done = index < completed;
          const active = index === completed;
          const waitingForEvidence = index >= 6 && !evidenceActive;
          return (
            <div
              className={`task ${done ? "done" : ""} ${active ? "active" : ""} ${waitingForEvidence ? "locked" : ""}`}
              key={task.label}
            >
              <span className="task-index">{done ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <div>
                <span className="task-kind">{task.kind}</span>
                <strong>{task.label}</strong>
                <small>{task.detail}</small>
              </div>
              {active && <i className={`task-spinner ${lane}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SourceStack() {
  return (
    <div className="source-stack">
      <div className="source-document release-document">
        <span>PDF · 34 PAGES</span>
        <h4>NORTHSTAR CLOUD</h4>
        <strong>Q2 2026 earnings release</strong>
        <div className="document-lines"><i /><i /><i /><i /></div>
        <div className="document-number">$428M</div>
      </div>
      <div className="source-document sheet-document">
        <span>XLSX · INTERNAL</span>
        <h4>CONSENSUS MODEL</h4>
        <div className="mini-grid">
          <b>Revenue</b><em>$411M</em><em>$415M</em>
          <b>NRR</b><em>116%</em><em>117%</em>
          <b>Op. margin</b><em>15.8%</em><em>15.6%</em>
        </div>
      </div>
      <div className="source-document transcript-document">
        <span>TRANSCRIPT · LIVE</span>
        <h4>Q1 MANAGEMENT LANGUAGE</h4>
        <p>“Enterprise demand remains durable across larger deployments.”</p>
      </div>
    </div>
  );
}

function ModelSheet({ normalized = false, partial = false }) {
  return (
    <div className="model-sheet">
      <div className="sheet-toolbar">
        <div><span />NORTHSTAR_FY26_MODEL.xlsx</div>
        <strong>{partial ? "RECONCILING" : normalized ? "MODEL v18" : "MODEL v17"}</strong>
      </div>
      <div className="sheet-grid sheet-head">
        <span>METRIC</span><span>STREET</span><span>REPORTED</span><span>NORMALIZED</span><span>DELTA</span>
      </div>
      <div className="sheet-grid">
        <strong>Q2 revenue</strong><span>$411M</span><span className="cell-good">$428M</span><span className={normalized ? "cell-warn" : "cell-loading"}>{normalized ? "$414M" : partial ? "…" : "$428M"}</span><span className={normalized ? "cell-warn" : "cell-good"}>{normalized ? "+0.8%" : "+4.1%"}</span>
        <strong>Enterprise ARR</strong><span>+25%</span><span className="cell-good">+29%</span><span className={partial ? "cell-loading" : ""}>{partial ? "…" : normalized ? "+25.8%" : "+29%"}</span><span>{partial ? "…" : normalized ? "+0.8pt" : "+4.0pt"}</span>
        <strong>FY revenue</strong><span>$1.67B</span><span>—</span><span className={partial ? "cell-loading" : normalized ? "cell-warn" : "cell-good"}>{partial ? "…" : normalized ? "$1.68B" : "$1.71B"}</span><span>{partial ? "…" : normalized ? "+$10M" : "+$40M"}</span>
        <strong>Op. margin</strong><span>15.8%</span><span>16.2%</span><span className={partial ? "cell-loading" : ""}>{partial ? "…" : normalized ? "15.9%" : "16.2%"}</span><span>{partial ? "…" : normalized ? "+10bp" : "+40bp"}</span>
      </div>
      <div className="formula-bar">
        <span>FORMULA</span>
        <code>= Q2_REPORTED − ATLAS_PULL_FORWARD</code>
        <strong>{normalized ? "$428M − $28M rev. allocation" : "waiting for timing inputs"}</strong>
      </div>
    </div>
  );
}

function ThesisCard({ revised = false }) {
  return (
    <div className={`thesis-card ${revised ? "revised" : ""}`}>
      <div className="thesis-meta"><span>SUPPORTED THESIS</span><strong>{revised ? "94% CONFIDENCE" : "86% CONFIDENCE"}</strong></div>
      <h3>{revised ? "Beat partly driven by timing" : "Clean beat with durable enterprise strength"}</h3>
      {revised && <div className="thesis-change">CONCLUSION CHANGED <strong>CLEAN BEAT → TIMING-ASSISTED</strong></div>}
      <p>{revised ? "The quarter still clears expectations, but most upside came from a renewal recognized earlier than modeled. The durable demand signal is narrower." : "Revenue, retention, and operating margin clear consensus. The first read supports raising the second-half revenue path."}</p>
      <div className="thesis-metrics">
        <div><span>{revised ? "NORMALIZED BEAT" : "REPORTED BEAT"}</span><strong>{revised ? "+0.8%" : "+4.1%"}</strong></div>
        <div><span>{revised ? "PULL-FORWARD" : "ENTERPRISE ARR"}</span><strong>{revised ? "$28M" : "+29%"}</strong></div>
        <div><span>FY MODEL</span><strong>{revised ? "$1.68B" : "$1.71B"}</strong></div>
      </div>
      <footer><span>Q2 release §2</span><span>Consensus sheet</span><span>{revised ? "Transcript 14:32" : "Internal model v17"}</span></footer>
    </div>
  );
}

function BriefingSlide() {
  return (
    <div className="slide-frame">
      <div className="slide-topline"><span>NORTHSTAR CLOUD · Q2 2026</span><strong>LIVE ANALYST BRIEF</strong></div>
      <h3>Timing, not acceleration.</h3>
      <p>The reported beat compresses from <strong>4.1%</strong> to <strong>0.8%</strong> after normalizing the Atlas renewal.</p>
      <div className="slide-chart">
        <div><span style={{ width: "74%" }} /><strong>CONSENSUS</strong><em>$411M</em></div>
        <div><span className="reported" style={{ width: "100%" }} /><strong>REPORTED</strong><em>$428M</em></div>
        <div><span className="normalized" style={{ width: "79%" }} /><strong>NORMALIZED</strong><em>$414M</em></div>
      </div>
      <div className="slide-question">
        <span>ASK MANAGEMENT NOW</span>
        <strong>How much Q3 contracted revenue was consumed by the early renewal—and did billing terms change?</strong>
      </div>
      <footer><span>4 claims verified · model v18</span><strong>READY BEFORE Q&amp;A</strong></footer>
    </div>
  );
}

function WorkProduct({ lane, completed, evidenceActive }) {
  if (lane === "standard") {
    if (completed < 1) return <div className="work-empty"><span>01</span><p>Waiting to parse release</p></div>;
    if (completed < 2) return <SourceStack />;
    if (completed < 5) return <ModelSheet partial />;
    if (completed < 6) return <ModelSheet />;
    return <ThesisCard />;
  }

  if (completed < 2) return <SourceStack />;
  if (completed < 5) return <ModelSheet partial={completed < 3} />;
  if (completed < 6 || !evidenceActive) return <ThesisCard />;
  if (completed < 8) return <div className="evidence-work"><ThesisCard /><div className="evidence-stamp">NEW FACT INVALIDATES ASSUMPTION</div></div>;
  if (completed < 10) return <ModelSheet normalized />;
  if (completed < 11) return <ThesisCard revised />;
  return <BriefingSlide />;
}

function Lane({ lane, elapsed, evidenceActive }) {
  const isUltra = lane === "ultrafast";
  const milestones = isUltra ? ULTRA_MILESTONES : STANDARD_MILESTONES;
  const completed = milestones.filter((time) => elapsed >= time).length;
  const loops = isUltra && completed === TASKS.length ? 2 : 0;
  const progress = Math.min(100, (completed / TASKS.length) * 100);

  return (
    <section className={`earnings-lane ${lane}`}>
      <header className="earnings-lane-header">
        <div className="tier-name">
          {isUltra && <img src="/assets/cerebras-logo.png" alt="" />}
          <div><span>{isUltra ? "ULTRAFAST" : "STANDARD"}</span><strong>GPT-5.6 Sol</strong></div>
        </div>
        <div className="lane-outcome">
          <span>{completed === TASKS.length ? "WORKFLOW COMPLETE" : "WORKFLOW PROGRESS"}</span>
          <strong>{completed}/{TASKS.length} steps</strong>
        </div>
      </header>
      <div className="lane-progress-track"><span style={{ width: `${progress}%` }} /></div>
      {evidenceActive && completed < 6 && <div className="queued-evidence"><span>NEW EVIDENCE WAITING</span>Current loop must finish before revision can begin</div>}
      <div className="lane-workspace">
        <TaskRail completed={completed} evidenceActive={evidenceActive} lane={lane} />
        <div className="work-product">
          <div className="work-product-label">
            <span>{isUltra && completed === TASKS.length ? "FINAL WORK PRODUCT" : "CURRENT OUTPUT"}</span>
            <strong>{loops ? `${loops} DECISION LOOPS` : completed >= 6 ? "FIRST PASS" : "IN PROGRESS"}</strong>
          </div>
          <WorkProduct lane={lane} completed={completed} evidenceActive={evidenceActive} />
        </div>
      </div>
    </section>
  );
}

export function EarningsDemo() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startedAtRef = useRef(0);
  const playbackRate = useMemo(() => new URLSearchParams(window.location.search).get("speed") === "20" ? 20 : 1, []);
  const evidenceActive = elapsed >= EVIDENCE_SECOND;
  const remaining = RUN_SECONDS - elapsed;
  const finished = elapsed >= RUN_SECONDS;

  useEffect(() => {
    if (!running) return undefined;
    const interval = window.setInterval(() => {
      const next = Math.min(RUN_SECONDS, ((performance.now() - startedAtRef.current) / 1000) * playbackRate);
      setElapsed(next);
      if (next >= RUN_SECONDS) setRunning(false);
    }, 50);
    return () => window.clearInterval(interval);
  }, [running, playbackRate]);

  function startDemo() {
    setElapsed(0);
    startedAtRef.current = performance.now();
    setRunning(true);
  }

  return (
    <main className="earnings-shell">
      <header className="earnings-topbar">
        <div className="earnings-brand"><img src="/assets/cerebras-logo.png" alt="Cerebras" /><span>CEREBRAS</span></div>
        <div className="same-work"><span>SAME MODEL</span><span>SAME DATA</span><span>11 SEQUENTIAL STEPS</span></div>
        <div className="deadline">
          <span>MANAGEMENT Q&amp;A IN</span>
          <strong className={remaining <= 10 ? "urgent" : ""}>{formatClock(remaining)}</strong>
        </div>
      </header>

      <section className="earnings-intro">
        <div><span>LIVE EARNINGS INTELLIGENCE</span><h1>Live Earnings Intelligence</h1></div>
        <div className="intro-action">
          <button onClick={startDemo} disabled={running}>{running ? "Demo running" : finished ? "Replay full 60s" : "Start 60s demo"}</button>
        </div>
      </section>

      <section className={`live-tape ${evidenceActive ? "evidence" : ""}`}>
        <div className="tape-time">{evidenceActive ? "14:32" : "14:08"}</div>
        <div><span>{evidenceActive ? "NEW DISCLOSURE · CEO" : "EARNINGS RELEASE POSTED"}</span><strong>{evidenceActive ? "The $28M Atlas renewal expected in Q3 closed early and was recognized in Q2." : "Northstar Q2 revenue: $428M · 4.1% above consensus."}</strong></div>
        <div className="tape-status">{evidenceActive ? "THESIS-CHANGING EVIDENCE" : running ? "WORKFLOW STARTED" : "AWAITING ANALYST"}</div>
      </section>

      <section className="earnings-comparison">
        <Lane lane="standard" elapsed={elapsed} evidenceActive={evidenceActive} />
        <Lane lane="ultrafast" elapsed={elapsed} evidenceActive={evidenceActive} />
      </section>

    </main>
  );
}
