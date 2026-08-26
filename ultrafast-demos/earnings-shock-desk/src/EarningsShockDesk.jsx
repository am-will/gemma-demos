import React from "react";
import "../../shared/quant-base.css";
import "./earnings-shock.css";
import {
  LaneHeader,
  QuantTopbar,
  ReplayButton,
  TaskRail,
  completedAt,
  useReplay
} from "../../shared/quantRuntime.jsx";

const TASKS = [
  { kind: "INGEST", label: "Parse release + deck", detail: "38 pages · tables + footnotes" },
  { kind: "RETRIEVE", label: "Load expectation stack", detail: "street · whisper · desk model" },
  { kind: "CALC", label: "Reconcile reported KPIs", detail: "18 metrics · 4 segments" },
  { kind: "MODEL", label: "Score surprise quality", detail: "volume · price · timing · mix" },
  { kind: "CALC", label: "Roll forward FY model", detail: "revenue · margin · FCF" },
  { kind: "VERIFY", label: "Cite first-read thesis", detail: "claim-to-source matrix" },
  { kind: "LIVE", label: "Ingest CFO disclosure", detail: "call transcript · 14:32" },
  { kind: "CALC", label: "Normalize pull-forward", detail: "$31M timing adjustment" },
  { kind: "MODEL", label: "Re-score beat quality", detail: "reported vs durable surprise" },
  { kind: "RISK", label: "Map factor exposure", detail: "growth · quality · momentum" },
  { kind: "VERIFY", label: "Challenge revised thesis", detail: "contradiction + citation pass" },
  { kind: "ARTIFACT", label: "Publish desk decision card", detail: "model delta + question" }
];

const ULTRA = [2, 5, 8, 11, 15, 19, 29, 33, 37, 42, 47, 52];
const STANDARD = [8, 17, 27, 38, 49, 59, 73, 88, 104, 121, 139, 158];
const DISCLOSURE_SECOND = 27;

const rows = [
  { metric: "Revenue", street: "$411M", whisper: "$415M", reported: "$428M", normalized: "$414M", delta: "+0.7%" },
  { metric: "Enterprise ARR", street: "+25%", whisper: "+27%", reported: "+29%", normalized: "+25.4%", delta: "+0.4pt" },
  { metric: "Op. margin", street: "15.8%", whisper: "16.0%", reported: "16.2%", normalized: "15.9%", delta: "+10bp" },
  { metric: "FY revenue", street: "$1.67B", whisper: "$1.69B", reported: "—", normalized: "$1.68B", delta: "+$10M" }
];

function ExpectationSheet({ partial = false, normalized = false }) {
  return (
    <div className="es-sheet">
      <header><span>NSTAR_Q2_EXPECTATIONS.xlsx</span><strong>{normalized ? "MODEL v24" : partial ? "RECONCILING" : "FIRST READ"}</strong></header>
      <div className="es-grid es-head"><span>METRIC</span><span>STREET</span><span>WHISPER</span><span>REPORTED</span><span>{normalized ? "NORMALIZED" : "DESK VIEW"}</span><span>VS STREET</span></div>
      {rows.map((row, index) => (
        <div className="es-grid" key={row.metric}>
          <strong>{row.metric}</strong><span>{row.street}</span><span>{row.whisper}</span><span className="positive">{row.reported}</span>
          <span className={normalized ? "warning" : partial ? "loading" : "positive"}>{partial ? "…" : normalized ? row.normalized : index === 3 ? "$1.72B" : row.reported}</span>
          <span className={normalized ? "warning" : "positive"}>{partial ? "…" : normalized ? row.delta : index === 0 ? "+4.1%" : index === 1 ? "+4.0pt" : index === 2 ? "+40bp" : "+$50M"}</span>
        </div>
      ))}
      <footer><span>QUALITY ADJUSTMENT</span><code>{normalized ? "reported − Atlas pull-forward − channel timing" : "awaiting management timing inputs"}</code></footer>
    </div>
  );
}

function FirstRead() {
  return (
    <article className="es-thesis">
      <div className="es-kicker"><span>FIRST-READ CLASSIFICATION</span><strong>87% CONFIDENCE</strong></div>
      <h3>Initial earnings assessment</h3>
      <p>Revenue, ARR, and operating margin clear both consensus and whisper expectations. Initial factor read favors growth and momentum.</p>
      <div className="es-score-row"><div><span>REPORTED SURPRISE</span><strong>+4.1%</strong></div><div><span>QUALITY SCORE</span><strong>82/100</strong></div><div><span>FY26 MODEL</span><strong>$1.72B</strong></div></div>
      <footer><span>Release p.2</span><span>Deck p.7</span><span>Consensus 13:58</span></footer>
    </article>
  );
}

function DecisionCard() {
  return (
    <article className="es-decision">
      <div className="es-decision-top"><span>DESK DECISION</span><strong>MODEL v24</strong></div>
      <div className="es-change"><span>THESIS REVISED</span><strong>BROAD BEAT → TIMING-ASSISTED BEAT</strong></div>
      <h3>Timing-adjusted earnings view</h3>
      <p>The apparent 4.1% revenue beat compresses to 0.7% after normalizing the Atlas renewal. Core demand remains constructive, but the acceleration signal is not durable.</p>
      <div className="es-score-row final"><div><span>NORMALIZED SURPRISE</span><strong>+0.7%</strong></div><div><span>QUALITY SCORE</span><strong>46/100</strong></div><div><span>FY26 MODEL</span><strong>$1.68B</strong></div></div>
      <div className="es-action"><span>QUESTION FOR MANAGEMENT</span><strong>How much Q3 contracted revenue moved into Q2, and did the renewal change billing terms?</strong></div>
      <footer><span>4 citations</span><span>3 sources</span><span>review complete</span></footer>
    </article>
  );
}

function WorkProduct({ lane, completed, evidenceActive }) {
  if (completed === 0) return <div className="q-empty"><div><span>01</span><p>Waiting for the earnings wire</p></div></div>;
  if (completed < 3) return <ExpectationSheet partial />;
  if (completed < 6) return <ExpectationSheet />;
  if (!evidenceActive || completed < 7) return <FirstRead />;
  if (completed < 9) return <div className="es-evidence"><FirstRead /><span>NEW DISCLOSURE RECEIVED</span></div>;
  if (completed < 11) return <ExpectationSheet normalized />;
  if (completed < 12) return <div className="es-challenging"><span>VERIFYING REVISED CLAIMS</span><strong>3/4 citations locked</strong><i /></div>;
  return <DecisionCard />;
}

function Lane({ lane, elapsed, evidenceActive }) {
  const completed = completedAt(elapsed, lane === "ultrafast" ? ULTRA : STANDARD);
  const queued = evidenceActive && completed < 6;
  return (
    <section className={`q-lane ${lane}`}>
      <LaneHeader lane={lane} complete={completed} total={TASKS.length} />
      {queued && <div className="es-queued"><span>NEW DISCLOSURE QUEUED</span><small>Current first-read chain still running</small></div>}
      <div className="q-lane-body">
        <TaskRail tasks={TASKS} completed={completed} lane={lane} lockedAfter={6} evidenceActive={evidenceActive} />
        <div className="q-product">
          <div className="q-product-label"><span>{completed === TASKS.length ? "DESK DECISION" : "CURRENT OUTPUT"}</span><strong>{completed === TASKS.length ? "2 PASSES COMPLETE" : completed >= 6 ? "FIRST PASS" : "IN PROGRESS"}</strong></div>
          <WorkProduct lane={lane} completed={completed} evidenceActive={evidenceActive} />
        </div>
      </div>
    </section>
  );
}

export function EarningsShockDesk() {
  const replay = useReplay();
  const evidenceActive = replay.elapsed >= DISCLOSURE_SECOND;
  return (
    <main className="q-shell es-shell">
      <QuantTopbar label="EARNINGS" remaining={replay.remaining} deadlineLabel="DESK HUDDLE IN" />
      <section className="q-hero">
        <div><h1>Earnings Shock Desk</h1></div>
        <div className="q-hero-action"><p>Compare reported results with Street, whisper, and desk expectations. Update the model when new information arrives.</p><ReplayButton replay={replay} /></div>
      </section>
      <section className={`q-tape ${evidenceActive ? "changed" : ""}`}>
        <div className="q-tape-time">{evidenceActive ? "14:32" : "14:00"}</div>
        <div><span>{evidenceActive ? "LIVE CALL · CFO DISCLOSURE" : "WIRE · NORTHSTAR CLOUD Q2"}</span><strong>{evidenceActive ? "$31M Atlas renewal expected in Q3 was recognized in Q2; no change to total contract value." : "Revenue $428M vs $411M consensus · operating margin 16.2% vs 15.8%."}</strong></div>
        <div className="q-tape-status">{evidenceActive ? "MODEL UPDATE REQUIRED" : replay.running ? "ANALYSIS RUNNING" : "AWAITING DESK"}</div>
      </section>
      <section className="q-comparison"><Lane lane="standard" elapsed={replay.elapsed} evidenceActive={evidenceActive} /><Lane lane="ultrafast" elapsed={replay.elapsed} evidenceActive={evidenceActive} /></section>
    </main>
  );
}
