import React from "react";
import "../../shared/quant-base.css";
import "./sec-radar.css";
import {
  LaneHeader,
  QuantTopbar,
  ReplayButton,
  TaskRail,
  completedAt,
  useReplay
} from "../../shared/quantRuntime.jsx";

const TASKS = [
  { kind: "STREAM", label: "Consume EDGAR filing batch", detail: "42 filings · index universe" },
  { kind: "ROUTE", label: "Split 8-K and 6-K", detail: "domestic + foreign issuers" },
  { kind: "TRIAGE", label: "Read item codes", detail: "material-event fast path" },
  { kind: "EXTRACT", label: "Open relevant exhibits", detail: "contracts · releases · notices" },
  { kind: "CLASSIFY", label: "Score adverse-event risk", detail: "9 governed categories" },
  { kind: "ENTITY", label: "Map securities + exposure", detail: "issuer · ADR · sector · factors" },
  { kind: "VERIFY", label: "Trace alert to filing", detail: "item · passage · exhibit" },
  { kind: "UPDATE", label: "Ingest amended exhibit", detail: "late covenant clarification" },
  { kind: "REVIEW", label: "Reject false positives", detail: "severity + contradiction pass" },
  { kind: "ARTIFACT", label: "Publish ranked watchlist", detail: "3 alerts · 1 dismissal" }
];

const ULTRA_STAGES = [3, 6, 10, 14, 19, 24, 30, 36, 43, 51];
const STANDARD_STAGES = [9, 19, 31, 45, 59, 76, 94, 113, 133, 154];
const AMENDMENT_SECOND = 34;

const filingRows = [
  ["14:00:01.082", "8-K", "HLCN", "4.02", "Non-reliance"],
  ["14:00:01.146", "6-K", "LTMC", "—", "Interim results"],
  ["14:00:01.228", "8-K", "ARDR", "1.01", "Credit amendment"],
  ["14:00:01.301", "8-K", "MDBI", "8.01", "Regulatory matter"],
  ["14:00:01.417", "8-K", "VELA", "5.02", "Officer departure"],
  ["14:00:01.503", "6-K", "ONDO", "—", "Trading update"]
];

const candidates = [
  { ticker: "HLCN", issuer: "Halcyon Mobility", form: "8-K · Item 4.02", title: "Previously issued financials unreliable", severity: "critical", reason: "Revenue-recognition error; audit committee investigation opened." },
  { ticker: "LTMC", issuer: "Lattice Marine", form: "6-K · Ex. 99.1", title: "Material going-concern uncertainty", severity: "critical", reason: "Twelve-month liquidity shortfall disclosed in interim results." },
  { ticker: "MDBI", issuer: "Meridian Bio", form: "8-K · Item 8.01", title: "DOJ civil investigative demand", severity: "high", reason: "Demand covers three years of federal reimbursement claims." },
  { ticker: "ARDR", issuer: "Ardent Retail", form: "8-K · Item 1.01", title: "Possible covenant acceleration", severity: "review", reason: "Amended credit agreement requires exhibit-level review." }
];

function processedCount(elapsed, lane) {
  return Math.min(42, Math.floor(elapsed * (lane === "ultrafast" ? .86 : .23)));
}

function FilingStream({ processed }) {
  return (
    <div className="sr-stream">
      <header><span>EDGAR INGEST</span><strong>{processed}/42 PARSED</strong></header>
      <div className="sr-stream-head"><span>ACCEPTED</span><span>FORM</span><span>TICKER</span><span>ITEM</span><span>ROUTE</span></div>
      {filingRows.map((row, index) => (
        <div className={`sr-filing ${index >= Math.max(1, Math.ceil(processed / 4)) ? "pending" : ""}`} key={row[0]}>
          {row.map((cell) => <span key={cell}>{cell}</span>)}
        </div>
      ))}
      <footer><i /><span>STREAM ACTIVE</span><strong>{Math.max(0, 42 - processed)} filings remaining</strong></footer>
    </div>
  );
}

function CandidateQueue({ reviewed = false }) {
  return (
    <div className="sr-candidates">
      <header><span>MATERIAL-EVENT CANDIDATES</span><strong>{reviewed ? "4/4 REVIEWED" : "EXHIBIT REVIEW"}</strong></header>
      {candidates.map((candidate, index) => (
        <article className={`${candidate.severity} ${reviewed && candidate.ticker === "ARDR" ? "dismissed" : ""}`} key={candidate.ticker}>
          <div className="sr-rank">{String(index + 1).padStart(2, "0")}</div>
          <div><span>{candidate.form}</span><h3>{candidate.ticker} · {candidate.title}</h3><p>{reviewed && candidate.ticker === "ARDR" ? "Exhibit confirms a 90-day waiver and no acceleration. Remove from material-alert queue." : candidate.reason}</p></div>
          <strong>{reviewed && candidate.ticker === "ARDR" ? "DISMISS" : candidate.severity.toUpperCase()}</strong>
        </article>
      ))}
    </div>
  );
}

function InitialAlerts() {
  return (
    <div className="sr-initial"><CandidateQueue /><div className="sr-first-read"><span>FIRST PASS</span><strong>4 potential material events</strong><small>1 alert still depends on an unread credit exhibit</small></div></div>
  );
}

function FinalRadar() {
  const finalCandidates = candidates.slice(0, 3);
  return (
    <article className="sr-radar">
      <div className="sr-radar-top"><span>RANKED EVENT RADAR</span><strong>42/42 FILINGS</strong></div>
      <div className="sr-dismissal"><span>FALSE POSITIVE REMOVED</span><strong>ARDR covenant acceleration → 90-day waiver confirmed in Ex. 10.1</strong></div>
      <div className="sr-alerts">
        {finalCandidates.map((candidate, index) => (
          <section className={candidate.severity} key={candidate.ticker}>
            <div><span>0{index + 1} · {candidate.form}</span><strong>{candidate.ticker}</strong></div>
            <h3>{candidate.title}</h3><p>{candidate.reason}</p>
            <footer><span>{index === 0 ? "8-K §4.02(a)" : index === 1 ? "6-K Ex.99.1 p.14" : "8-K §8.01"}</span><strong>{candidate.severity.toUpperCase()}</strong></footer>
          </section>
        ))}
      </div>
      <div className="sr-summary"><span>3 MATERIAL ALERTS</span><span>1 FALSE POSITIVE REJECTED</span><span>38 ROUTINE FILINGS CLEARED</span></div>
    </article>
  );
}

function WorkProduct({ stage, processed, amendmentActive }) {
  if (stage === 0 && processed === 0) return <div className="q-empty"><div><span>42</span><p>Waiting for the filing batch</p></div></div>;
  if (stage < 4) return <FilingStream processed={processed} />;
  if (stage < 7) return <InitialAlerts />;
  if (!amendmentActive || stage < 8) return <InitialAlerts />;
  if (stage < 10) return <CandidateQueue reviewed />;
  return <FinalRadar />;
}

function Lane({ lane, elapsed, amendmentActive }) {
  const stage = completedAt(elapsed, lane === "ultrafast" ? ULTRA_STAGES : STANDARD_STAGES);
  const processed = processedCount(elapsed, lane);
  return (
    <section className={`q-lane ${lane}`}>
      <LaneHeader lane={lane} complete={processed} total={42} unit="filings" />
      {amendmentActive && stage < 7 && <div className="sr-queued"><span>AMENDED EXHIBIT QUEUED</span><small>Initial filing batch still processing</small></div>}
      <div className="q-lane-body">
        <TaskRail tasks={TASKS} completed={stage} lane={lane} lockedAfter={7} evidenceActive={amendmentActive} />
        <div className="q-product"><div className="q-product-label"><span>{stage === TASKS.length ? "EVENT WATCHLIST" : "CURRENT OUTPUT"}</span><strong>{stage === TASKS.length ? "3 ALERTS" : stage >= 5 ? "CANDIDATE TRIAGE" : "STREAMING"}</strong></div><WorkProduct stage={stage} processed={processed} amendmentActive={amendmentActive} /></div>
      </div>
    </section>
  );
}

export function SecEventRadar() {
  const replay = useReplay();
  const amendmentActive = replay.elapsed >= AMENDMENT_SECOND;
  return (
    <main className="q-shell sr-shell">
      <QuantTopbar label="FILINGS" remaining={replay.remaining} deadlineLabel="RISK HUDDLE IN" />
      <section className="q-hero"><div><h1>SEC Material Event Radar</h1></div><div className="q-hero-action"><p>Review incoming 8-K and 6-K filings, open relevant exhibits, and rank material events.</p><ReplayButton replay={replay} /></div></section>
      <section className={`q-tape ${amendmentActive ? "changed" : ""}`}><div className="q-tape-time">{amendmentActive ? "14:00:34" : "14:00:01"}</div><div><span>{amendmentActive ? "EDGAR UPDATE · ARDR EXHIBIT 10.1" : "EDGAR FILING BATCH · INDEX UNIVERSE"}</span><strong>{amendmentActive ? "Credit amendment grants a 90-day covenant waiver; no payment acceleration has occurred." : "42 new filings accepted: 34 Form 8-K · 8 Form 6-K · 97 attached exhibits."}</strong></div><div className="q-tape-status">{amendmentActive ? "ALERT UPDATE REQUIRED" : replay.running ? "FILING REVIEW RUNNING" : "AWAITING BATCH"}</div></section>
      <section className="q-comparison"><Lane lane="standard" elapsed={replay.elapsed} amendmentActive={amendmentActive} /><Lane lane="ultrafast" elapsed={replay.elapsed} amendmentActive={amendmentActive} /></section>
    </main>
  );
}
