import React from "react";
import "../../shared/quant-base.css";
import "./fomc.css";
import {
  LaneHeader,
  QuantTopbar,
  ReplayButton,
  TaskRail,
  completedAt,
  useReplay
} from "../../shared/quantRuntime.jsx";

const TASKS = [
  { kind: "INGEST", label: "Parse new minutes", detail: "27 pages · 13,842 words" },
  { kind: "RETRIEVE", label: "Load policy baseline", detail: "statement · presser · prior minutes" },
  { kind: "DIFF", label: "Align changed passages", detail: "semantic + exact-language delta" },
  { kind: "CLASSIFY", label: "Score policy direction", detail: "hawkish · dovish · uncertainty" },
  { kind: "MAP", label: "Identify committee blocs", detail: "several · some · a few · most" },
  { kind: "MARKET", label: "Compare priced path", detail: "OIS curve · 6 meeting probabilities" },
  { kind: "THESIS", label: "Draft curve implication", detail: "2Y · 5Y · 10Y · 30Y" },
  { kind: "CHALLENGE", label: "Test analyst objection", detail: "bloc inference vs vote record" },
  { kind: "VERIFY", label: "Trace every delta", detail: "passage · section · baseline" },
  { kind: "RISK", label: "Map exposed positions", detail: "duration · banks · USD · gold" },
  { kind: "ARTIFACT", label: "Publish policy shock map", detail: "cited delta + scenario" }
];

const ULTRA = [3, 6, 9, 12, 16, 20, 25, 34, 40, 46, 52];
const STANDARD = [10, 21, 34, 48, 62, 78, 96, 115, 135, 156, 178];
const CHALLENGE_SECOND = 31;

const deltas = [
  { topic: "Inflation persistence", before: "Further progress expected", now: "Progress may remain uneven", tone: "hawk", score: "+18" },
  { topic: "Labor-market risk", before: "Risks roughly balanced", now: "Downside risks have increased", tone: "dove", score: "−11" },
  { topic: "Next policy move", before: "Several saw scope to ease", now: "Some favored patience", tone: "hawk", score: "+14" }
];

function SourceAlignment({ partial = false }) {
  return (
    <div className="fm-sources">
      <header><span>POLICY SOURCE ALIGNMENT</span><strong>{partial ? "INDEXING" : "4 SOURCES LOCKED"}</strong></header>
      {[
        ["NEW", "FOMC minutes", "27 pages", "2:00:00 PM"],
        ["BASE", "Policy statement", "824 words", "21 days prior"],
        ["BASE", "Chair press conference", "47 min", "21 days prior"],
        ["MKT", "OIS implied path", "6 meetings", "1:59:59 PM"]
      ].map(([kind, title, detail, time], index) => (
        <div className={`fm-source ${partial && index > 1 ? "pending" : ""}`} key={title}>
          <span>{kind}</span><strong>{title}</strong><small>{detail}</small><em>{partial && index > 1 ? "…" : time}</em>
        </div>
      ))}
      <footer><span>COMPARISON</span><strong>New minutes, prior statement, press conference, and OIS curve</strong></footer>
    </div>
  );
}

function DeltaTable({ traced = false }) {
  return (
    <div className="fm-deltas">
      <header><span>LANGUAGE DELTA</span><span>PRIOR BASELINE</span><span>NEW MINUTES</span><span>BIAS</span></header>
      {deltas.map((delta) => (
        <div className="fm-delta" key={delta.topic}>
          <strong>{delta.topic}</strong><p>{delta.before}</p><p>{delta.now}</p><span className={delta.tone}>{delta.score}</span>
          {traced && <small>§{delta.topic === "Inflation persistence" ? "2.4" : delta.topic === "Labor-market risk" ? "3.1" : "4.2"} · traced</small>}
        </div>
      ))}
      <div className="fm-net"><span>NET POLICY DELTA</span><div><i style={{ width: "61%" }} /><b /></div><strong>+9 HAWKISH</strong></div>
    </div>
  );
}

function FirstPolicyRead() {
  return (
    <article className="fm-read">
      <span>FIRST POLICY READ · 84% CONFIDENCE</span>
      <h3>Minutes lean modestly hawkish.</h3>
      <p>Inflation language hardened and the easing bloc appears smaller than the statement implied. Initial read favors a higher-for-longer front end.</p>
      <div className="fm-mini-curve"><span>2Y <b>+7bp</b></span><span>5Y <b>+5bp</b></span><span>10Y <b>+2bp</b></span><span>30Y <b>0bp</b></span></div>
      <footer><span>Minutes §2.4</span><span>Statement ¶3</span><span>OIS 13:59:59</span></footer>
    </article>
  );
}

function ShockMap() {
  return (
    <article className="fm-map">
      <div className="fm-map-top"><span>POLICY SHOCK MAP</span><strong>3 PASSAGES TRACED</strong></div>
      <div className="fm-revision"><span>ANALYST REVIEW</span><strong>“SOME” IS NOT A VOTING-BLOC COUNT</strong></div>
      <div className="fm-map-grid">
        <section><h3>Hawkish tilt,<br />lower conviction.</h3><p>The voting record does not support treating “some” as a stable bloc. The revised curve scenario keeps the direction and reduces the projected move.</p></section>
        <section className="fm-curve">
          {[ ["2Y", 72, "+5bp"], ["5Y", 55, "+3bp"], ["10Y", 34, "+1bp"], ["30Y", 19, "0bp"] ].map(([label, width, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${width}%` }} /></i><strong>{value}</strong></div>)}
        </section>
      </div>
      <div className="fm-positions"><span>POSITION WATCH</span><strong>Front-end duration</strong><em>negative</em><strong>Bank NIM basket</strong><em>positive</em><strong>USD</strong><em>mild positive</em></div>
      <footer><span>3 deltas traced</span><span>1 inference downgraded</span><span>4 exposures mapped</span></footer>
    </article>
  );
}

function WorkProduct({ completed, challengeActive }) {
  if (completed === 0) return <div className="q-empty"><div><span>2:00</span><p>Waiting for the minutes release</p></div></div>;
  if (completed < 3) return <SourceAlignment partial={completed < 2} />;
  if (completed < 6) return <DeltaTable />;
  if (!challengeActive || completed < 8) return <FirstPolicyRead />;
  if (completed < 9) return <div className="fm-challenge"><FirstPolicyRead /><span>CHALLENGE: ARE YOU OVER-READING “SOME”?</span></div>;
  if (completed < 11) return <DeltaTable traced />;
  return <ShockMap />;
}

function Lane({ lane, elapsed, challengeActive }) {
  const completed = completedAt(elapsed, lane === "ultrafast" ? ULTRA : STANDARD);
  return (
    <section className={`q-lane ${lane}`}>
      <LaneHeader lane={lane} complete={completed} total={TASKS.length} />
      {challengeActive && completed < 7 && <div className="fm-queued"><span>ANALYST CHALLENGE WAITING</span><small>First policy read incomplete</small></div>}
      <div className="q-lane-body">
        <TaskRail tasks={TASKS} completed={completed} lane={lane} lockedAfter={7} evidenceActive={challengeActive} />
        <div className="q-product"><div className="q-product-label"><span>{completed === TASKS.length ? "POLICY SHOCK MAP" : "CURRENT OUTPUT"}</span><strong>{completed === TASKS.length ? "COMPLETE" : completed >= 7 ? "FIRST READ" : "DIFFING"}</strong></div><WorkProduct completed={completed} challengeActive={challengeActive} /></div>
      </div>
    </section>
  );
}

export function FomcShockMap() {
  const replay = useReplay();
  const challengeActive = replay.elapsed >= CHALLENGE_SECOND;
  return (
    <main className="q-shell fm-shell">
      <QuantTopbar label="RATES" remaining={replay.remaining} deadlineLabel="RATES HUDDLE IN" />
      <section className="q-hero"><div><h1>FOMC Minutes Shock Map</h1></div><div className="q-hero-action"><p>Compare new minutes with the prior statement, press conference, and current market pricing.</p><ReplayButton replay={replay} /></div></section>
      <section className={`q-tape ${challengeActive ? "changed" : ""}`}><div className="q-tape-time">{challengeActive ? "2:00:31" : "2:00:00"}</div><div><span>{challengeActive ? "RATES PM · LIVE CHALLENGE" : "FEDERAL RESERVE · MINUTES RELEASED"}</span><strong>{challengeActive ? "You are treating “some participants” as a voting bloc. Prove that from the vote record—or reduce conviction." : "New language: inflation progress may remain uneven; some participants favored maintaining restraint."}</strong></div><div className="q-tape-status">{challengeActive ? "REVIEW REQUIRED" : replay.running ? "POLICY DIFF RUNNING" : "AWAITING RELEASE"}</div></section>
      <section className="q-comparison"><Lane lane="standard" elapsed={replay.elapsed} challengeActive={challengeActive} /><Lane lane="ultrafast" elapsed={replay.elapsed} challengeActive={challengeActive} /></section>
    </main>
  );
}
