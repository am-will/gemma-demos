import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../shared/quant-base.css";
import "./qwen-earnings.css";
import cerebrasLogo from "../../../llm-output-simulator/public/assets/cerebras-logo.png";

const DECK_URL = "https://s26.q4cdn.com/463892824/files/doc_financials/2026/q2/Q2-FY2026-Investor-Presentation_vF.pdf";
const TRANSCRIPT_URL = "https://s26.q4cdn.com/463892824/files/doc_financials/2026/q2/CORRECTED-TRANSCRIPT_-Snowflake-Inc-SNOW-US-Q2-2026-Earnings-Call-27-August-2025-5_00-PM-ET.pdf";
const DEFAULT_CHALLENGE = "Product revenue grew 32%, well above the prior guide. Is that enough evidence to underwrite 30% growth from here?";

const EVIDENCE_PAGES = [
  { document: "deck", page: 13, label: "KPI" },
  { document: "deck", page: 16, label: "GROWTH" },
  { document: "deck", page: 17, label: "RPO" },
  { document: "deck", page: 20, label: "NRR" },
  { document: "deck", page: 21, label: "MARGIN" },
  { document: "deck", page: 25, label: "GUIDE" },
  { document: "deck", page: 33, label: "CASH" },
  { document: "transcript", page: 9, label: "CALL 09" },
  { document: "transcript", page: 14, label: "CALL 14" }
];

const STAGES = [
  { id: "triage", label: "Package triage", detail: "Read all 54 pages" },
  { id: "beat", label: "Beat math", detail: "Check the prior guide" },
  { id: "dashboard", label: "KPI dashboard", detail: "Inspect deck page 13", evidence: [{ document: "deck", page: 13 }] },
  { id: "growth", label: "Growth trajectory", detail: "Inspect deck page 16", evidence: [{ document: "deck", page: 16 }] },
  { id: "backlog", label: "Contract visibility", detail: "Inspect deck page 17", evidence: [{ document: "deck", page: 17 }] },
  { id: "retention", label: "Customer retention", detail: "Inspect deck page 20", evidence: [{ document: "deck", page: 20 }] },
  { id: "conversion", label: "Margin conversion", detail: "Inspect deck page 21", evidence: [{ document: "deck", page: 21 }] },
  { id: "cash", label: "Cash reconciliation", detail: "Inspect deck page 33", evidence: [{ document: "deck", page: 33 }] },
  { id: "outlook", label: "Forward guide", detail: "Inspect deck page 25", evidence: [{ document: "deck", page: 25 }] },
  { id: "assessment", label: "Preliminary brief", detail: "Build the deck-only view" },
  { id: "transcript", label: "Management context", detail: "Read call pages 9 and 14", evidence: [{ document: "transcript", page: 9 }, { document: "transcript", page: 14 }] },
  { id: "filing", label: "10-Q cross-check", detail: "Research the filing" },
  { id: "stress", label: "Run-rate stress test", detail: "Normalize the acceleration" },
  { id: "challenge", label: "Analyst challenge", detail: "Test and revise the thesis" }
];

function formatTime(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function humanize(value) {
  const labels = {
    durable_reacceleration: "Durable reacceleration",
    real_beat_not_new_run_rate: "Real beat, not a new run rate",
    low_quality_beat: "Low-quality beat"
  };
  return String(labels[value] || value || "").replaceAll("_", " ");
}

function sentenceCase(value) {
  const text = humanize(value).trim();
  const index = text.search(/[A-Za-z]/);
  if (index < 0) return text;
  return `${text.slice(0, index)}${text[index].toUpperCase()}${text.slice(index + 1)}`;
}

function splitParagraphs(value) {
  const protectedText = sentenceCase(value).replace(/(\d)\.(\d)/g, "$1\u0000$2");
  const sentences = (protectedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [protectedText])
    .map((sentence) => sentence.trim().replaceAll("\u0000", "."))
    .filter(Boolean);
  const paragraphs = [];
  for (let index = 0; index < sentences.length; index += 2) paragraphs.push(sentences.slice(index, index + 2).join(" "));
  return paragraphs;
}

function Brand() {
  return (
    <div className="qe-brand">
      <img src={cerebrasLogo} alt="" />
      <strong>CEREBRAS</strong>
    </div>
  );
}

function EvidenceLabel({ pages = [] }) {
  if (!pages.length) return null;
  return (
    <span className="qe-evidence-label">
      {pages.map(({ document, page }) => `${document === "deck" ? "DECK" : "CALL"} ${page}`).join(" · ")}
    </span>
  );
}

function Prose({ children, className = "" }) {
  return (
    <div className={`qe-prose ${className}`}>
      {splitParagraphs(children).map((paragraph, index) => <p key={`${index}-${paragraph}`}>{paragraph}</p>)}
    </div>
  );
}

function Metric({ label, value, note }) {
  return (
    <div className="qe-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{sentenceCase(note)}</small>}
    </div>
  );
}

function DetailCard({ label, children }) {
  return (
    <section className="qe-detail-card">
      <span>{label}</span>
      <div>{children}</div>
    </section>
  );
}

function ResultHeader({ label, pages, confidence }) {
  return (
    <header className="qe-result-header">
      <span>{label}</span>
      <div>
        <EvidenceLabel pages={pages} />
        {confidence && <small>{confidence} confidence</small>}
      </div>
    </header>
  );
}

function StageFinding({ stage, payload }) {
  if (!payload) return null;
  const data = payload.result;

  if (stage === "triage") return (
    <article className="qe-result">
      <ResultHeader label="PACKAGE MAP" pages={data.source_pages} />
      <h2>{sentenceCase(data.central_question)}</h2>
      <Prose>{data.initial_read}</Prose>
      <DetailCard label="WHAT IS IN THE ROOM"><Prose>{data.package_summary}</Prose></DetailCard>
    </article>
  );

  if (stage === "beat") return (
    <article className="qe-result">
      <ResultHeader label="OFFICIAL GUIDE CHECK" confidence={data.confidence} />
      <h2>{sentenceCase(data.finding)}</h2>
      <div className="qe-metric-grid qe-metric-grid-3">
        <Metric label="REPORTED" value={data.reported_product_revenue} note={data.reported_growth} />
        <Metric label="PRIOR GUIDE" value={data.prior_guidance} note={data.prior_guided_growth} />
        <Metric label="BEAT VS HIGH" value={data.beat_dollars} note={`Operating margin ${data.operating_margin}`} />
      </div>
      <p className="qe-caveat">{sentenceCase(data.caveat)}</p>
    </article>
  );

  if (stage === "dashboard") return (
    <article className="qe-result">
      <ResultHeader label="HEADLINE DASHBOARD" pages={data.source_pages} confidence={data.confidence} />
      <h2>{sentenceCase(data.finding)}</h2>
      <div className="qe-metric-grid qe-metric-grid-2">
        {data.metrics.map((metric) => <Metric key={metric.label} label={metric.label} value={metric.value} note={metric.interpretation} />)}
      </div>
      <p className="qe-signal"><strong>Strongest signal</strong>{sentenceCase(data.strongest_signal)}</p>
    </article>
  );

  if (stage === "growth") return (
    <article className="qe-result">
      <ResultHeader label="GROWTH TRAJECTORY" pages={data.source_pages} confidence={data.confidence} />
      <h2>{sentenceCase(data.finding)}</h2>
      <div className="qe-quarter-strip">
        {data.quarterly_revenue.map((item) => (
          <div key={item.quarter}><span>{item.quarter}</span><strong>{item.product_revenue}</strong><small>{item.quarter === data.quarterly_revenue.at(-1)?.quarter ? data.latest_quarter_growth : ""}</small></div>
        ))}
      </div>
      <DetailCard label="DURABILITY QUESTION"><Prose>{data.durability_question}</Prose></DetailCard>
    </article>
  );

  if (stage === "backlog") return (
    <article className="qe-result">
      <ResultHeader label="CONTRACT VISIBILITY" pages={data.source_pages} confidence={data.confidence} />
      <h2>{sentenceCase(data.finding)}</h2>
      <div className="qe-metric-grid qe-metric-grid-2">
        <Metric label="CURRENT RPO" value={data.current_rpo} note={data.year_over_year_growth} />
        <Metric label="NEXT 12 MONTHS" value={data.expected_within_twelve_months} />
      </div>
      <div className="qe-quarter-strip">{data.rpo_series.map((item) => <div key={item.quarter}><span>{item.quarter}</span><strong>{item.value}</strong></div>)}</div>
      <p className="qe-caveat">{sentenceCase(data.limitation)}</p>
    </article>
  );

  if (stage === "retention") return (
    <article className="qe-result">
      <ResultHeader label="CUSTOMER RETENTION" pages={data.source_pages} confidence={data.confidence} />
      <h2>{sentenceCase(data.finding)}</h2>
      <div className="qe-quarter-strip">{data.nrr_series.map((item) => <div key={item.quarter}><span>{item.quarter}</span><strong>{item.rate}</strong></div>)}</div>
      <p className="qe-signal"><strong>Stabilization</strong>{sentenceCase(data.stabilization_signal)}</p>
      <p className="qe-caveat">{sentenceCase(data.limitation)}</p>
    </article>
  );

  if (stage === "conversion") return (
    <article className="qe-result">
      <ResultHeader label="MARGIN CONVERSION" pages={data.source_pages} confidence={data.confidence} />
      <h2>{sentenceCase(data.finding)}</h2>
      <div className="qe-bridge">
        <Metric label="GROSS MARGIN" value={data.gross_margin} />
        <i>→</i>
        <Metric label="OPERATING" value={data.operating_margin_change} />
        <i>→</i>
        <Metric label="FREE CASH FLOW" value={data.free_cash_flow_margin_change} />
      </div>
      <p className="qe-caveat">{sentenceCase(data.earnings_quality_tension)}</p>
    </article>
  );

  if (stage === "cash") return (
    <article className="qe-result">
      <ResultHeader label="CASH RECONCILIATION" pages={data.source_pages} confidence={data.confidence} />
      <h2>{sentenceCase(data.finding)}</h2>
      <div className="qe-metric-grid qe-metric-grid-3">
        <Metric label="OPERATING CASH FLOW" value={data.operating_cash_flow} />
        <Metric label="ADJUSTED FCF" value={data.adjusted_free_cash_flow} />
        <Metric label="ADJUSTED FCF MARGIN" value={data.adjusted_free_cash_flow_margin} />
      </div>
      <div className="qe-quarter-strip">{data.largest_reconciliation_items.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
      <p className="qe-caveat">{sentenceCase(data.quality_caveat)}</p>
    </article>
  );

  if (stage === "outlook") return (
    <article className="qe-result">
      <ResultHeader label="FORWARD GUIDE" pages={data.source_pages} confidence={data.confidence} />
      <h2>{sentenceCase(data.finding)}</h2>
      <div className="qe-metric-grid qe-metric-grid-2">
        <Metric label="Q3 PRODUCT REVENUE" value={data.q3_product_revenue} note={data.q3_growth} />
        <Metric label="FY26 PRODUCT REVENUE" value={data.full_year_product_revenue} note={data.full_year_growth} />
      </div>
      <p className="qe-signal"><strong>Run-rate implication</strong>{sentenceCase(data.run_rate_implication)}</p>
    </article>
  );

  if (stage === "transcript") return (
    <article className="qe-result">
      <ResultHeader label="MANAGEMENT CONTEXT" pages={data.source_pages} confidence={data.confidence} />
      <h2>{sentenceCase(data.finding)}</h2>
      <Prose>{data.management_explanation}</Prose>
      <div className="qe-two-up">
        <DetailCard label="MIGRATION EFFECT"><Prose>{data.large_customer_migrations}</Prose></DetailCard>
        <DetailCard label="NORMALIZATION RISK"><Prose>{data.normalization_risk}</Prose></DetailCard>
      </div>
    </article>
  );

  if (stage === "filing") return (
    <article className="qe-result">
      <ResultHeader label="10-Q CROSS-CHECK" confidence={data.confidence} />
      <h2>{sentenceCase(data.finding)}</h2>
      <div className="qe-two-up">
        <DetailCard label="CASH FLOW"><Prose>{data.cash_flow_context}</Prose></DetailCard>
        <DetailCard label="CONTRACT TIMING"><Prose>{data.consumption_and_contract_context}</Prose></DetailCard>
      </div>
      <p className="qe-signal"><strong>What it changes</strong>{sentenceCase(data.what_it_changes)}</p>
    </article>
  );

  if (stage === "stress") return (
    <article className="qe-result">
      <ResultHeader label="RUN-RATE STRESS TEST" confidence={data.confidence} />
      <h2>{sentenceCase(data.finding)}</h2>
      <div className="qe-metric-grid qe-metric-grid-3">
        <Metric label="REPORTED" value={data.reported_growth} />
        <Metric label="NEXT QUARTER" value={data.next_quarter_growth} />
        <Metric label="FULL YEAR" value={data.full_year_growth} />
      </div>
      <div className="qe-two-up">
        <DetailCard label="SUPPORTS"><ul>{data.supporting_factors.map((item) => <li key={item}>{item}</li>)}</ul></DetailCard>
        <DetailCard label="LIMITS"><ul>{data.limiting_factors.map((item) => <li key={item}>{item}</li>)}</ul></DetailCard>
      </div>
      <p className="qe-signal"><strong>Normalized view</strong>{sentenceCase(data.normalized_view)}</p>
    </article>
  );

  if (stage === "assessment") return (
    <article className="qe-result qe-brief">
      <ResultHeader label="INITIAL EARNINGS BRIEF" confidence={data.confidence} />
      <div className="qe-verdict">{humanize(data.verdict)}</div>
      <h2>{sentenceCase(data.headline)}</h2>
      <Prose>{data.conclusion}</Prose>
      <div className="qe-bridge-grid">
        {data.bridge.map((item) => <Metric key={item.label} label={item.label} value={item.value} note={item.meaning} />)}
      </div>
      <DetailCard label="NEXT QUESTION"><Prose>{data.analyst_question}</Prose></DetailCard>
    </article>
  );

  if (stage === "challenge") return (
    <article className="qe-result qe-brief qe-final">
      <ResultHeader label="REVISED EARNINGS BRIEF" confidence={data.confidence} />
      <div className="qe-verdict">{humanize(data.verdict)}</div>
      <blockquote>{sentenceCase(data.challenge)}</blockquote>
      <h2>{sentenceCase(data.revised_headline)}</h2>
      <Prose className="qe-answer">{data.direct_answer}</Prose>
      <section className="qe-full-analysis">
        <span>FULL ANALYSIS</span>
        <Prose>{data.revised_conclusion}</Prose>
        <div className="qe-two-up">
          <DetailCard label="WHAT CHANGED"><Prose>{data.what_changed}</Prose></DetailCard>
          <DetailCard label="WHAT HELD"><Prose>{data.what_held}</Prose></DetailCard>
        </div>
        <p className="qe-signal"><strong>Next question</strong>{sentenceCase(data.next_question)}</p>
      </section>
    </article>
  );

  return null;
}

function StageGrid({ activeStage, selectedStage, stageResults, running, onSelect }) {
  return (
    <ol className="qe-stage-grid">
      {STAGES.map((stage, index) => {
        const complete = Boolean(stageResults[stage.id]);
        const active = stage.id === activeStage;
        const selected = stage.id === selectedStage;
        return (
          <li className={`${complete ? "complete" : ""} ${active ? "active" : ""} ${selected ? "selected" : ""}`} key={stage.id}>
            <button type="button" disabled={!complete} onClick={() => onSelect(stage)} aria-pressed={selected}>
              <span>{complete ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <div><strong>{stage.label}</strong><small>{active && running ? "RUNNING" : complete ? formatTime(stageResults[stage.id].elapsedMs) : stage.detail}</small></div>
              {active && running && <i />}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

async function readNdjson(response, onEvent) {
  if (!response.body) throw new Error("The server did not return a response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines.filter(Boolean)) onEvent(JSON.parse(line));
    if (done) break;
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}

export function QwenLiveEarningsReview() {
  const [status, setStatus] = useState(null);
  const [running, setRunning] = useState(false);
  const [activeStage, setActiveStage] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [activeEvidence, setActiveEvidence] = useState(EVIDENCE_PAGES[0]);
  const [stageResults, setStageResults] = useState({});
  const [finalResult, setFinalResult] = useState(null);
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState(DEFAULT_CHALLENGE);
  const [startedAt, setStartedAt] = useState(null);
  const [clock, setClock] = useState(0);
  const [researchSources, setResearchSources] = useState([]);
  const outputRef = useRef(null);

  useEffect(() => {
    fetch("/api/status").then((result) => result.json()).then(setStatus).catch(() => setStatus({ connected: false }));
  }, []);

  useEffect(() => {
    if (!running || !startedAt) return undefined;
    const tick = () => setClock(performance.now() - startedAt);
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [running, startedAt]);

  const visibleStage = useMemo(() => {
    const completed = STAGES.filter((stage) => stageResults[stage.id]);
    return (selectedStage && stageResults[selectedStage] ? selectedStage : null)
      || (activeStage && stageResults[activeStage] ? activeStage : completed.at(-1)?.id)
      || null;
  }, [activeStage, selectedStage, stageResults]);

  function selectStage(stage) {
    if (!stageResults[stage.id]) return;
    setSelectedStage(stage.id);
    const evidence = stageResults[stage.id].evidence?.[0] || stage.evidence?.[0];
    if (evidence) setActiveEvidence({ ...evidence, label: evidence.document === "deck" ? `PAGE ${evidence.page}` : `CALL ${evidence.page}` });
    outputRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function analyze() {
    setRunning(true);
    setStageResults({});
    setFinalResult(null);
    setError("");
    setActiveStage("triage");
    setSelectedStage(null);
    setActiveEvidence(EVIDENCE_PAGES[0]);
    setResearchSources([]);
    const start = performance.now();
    setStartedAt(start);
    setClock(0);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge }) });
      await readNdjson(response, (event) => {
        if (event.type === "stage_start") {
          setActiveStage(event.stage);
          if (event.document && event.page) setActiveEvidence({ document: event.document, page: event.page, label: event.document === "deck" ? `PAGE ${event.page}` : `CALL ${event.page}` });
        }
        if (event.type === "stage_result") {
          setStageResults((current) => ({ ...current, [event.stage]: event }));
          window.setTimeout(() => outputRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 0);
        }
        if (event.type === "research_source") {
          setResearchSources((current) => [...current.filter((source) => source.url !== event.url), event]);
        }
        if (event.type === "result") {
          setFinalResult(event);
          setClock(event.elapsedMs);
        }
        if (event.type === "error") throw new Error(event.message);
      });
    } catch (caught) {
      setError(caught.message || "Earnings review failed.");
    } finally {
      setRunning(false);
      setActiveStage(null);
    }
  }

  const activeSourceUrl = activeEvidence.document === "deck" ? DECK_URL : TRANSCRIPT_URL;

  return (
    <main className="qe-shell">
      <header className="qe-topbar">
        <Brand />
        <div className="qe-model">QWEN3.8-27B · MULTIMODAL</div>
        <div className="qe-edition">LIVE EARNINGS · Q2 FY26</div>
      </header>

      <section className="qe-title-row">
        <div><span>EARNINGS QUALITY REVIEW</span><h1>Beat ≠ run rate.</h1></div>
        <p>Read the deck. Read the call. Rebuild the earnings thesis before the market moves on.</p>
      </section>

      <section className="qe-runbar">
        <div className="qe-event"><span>SNOWFLAKE · 54-PAGE SOURCE PACKAGE</span><strong>Q2 product revenue grows 32%. Is the acceleration durable?</strong></div>
        <div className="qe-clock"><span>{running ? "REVIEW RUNNING" : finalResult ? "REVIEW COMPLETE" : "READY"}</span><strong>{formatTime(clock)}</strong></div>
        <button type="button" onClick={analyze} disabled={running || !status?.connected}>{running ? "Reviewing earnings" : finalResult ? "Run full review again" : "Start earnings review"}</button>
      </section>

      <section className="qe-challenge">
        <div><span>LIVE ANALYST CHALLENGE</span><small>Applied after the first earnings brief</small></div>
        <textarea value={challenge} onChange={(event) => setChallenge(event.target.value)} disabled={running} rows={2} />
      </section>

      <section className="qe-workbench">
        <article className="qe-evidence">
          <header>
            <div><span>VISUAL EVIDENCE</span><strong>{activeEvidence.document === "deck" ? `INVESTOR DECK · PAGE ${activeEvidence.page}` : `EARNINGS CALL · PAGE ${activeEvidence.page}`}</strong></div>
            <a href={activeSourceUrl} target="_blank" rel="noreferrer">OPEN SOURCE</a>
          </header>
          <div className="qe-page">
            <img src={`/api/example/${activeEvidence.document}/${activeEvidence.page}`} alt={`${activeEvidence.document} page ${activeEvidence.page}`} />
            {running && <div className="qe-scan" />}
          </div>
          <footer>
            <span>EVIDENCE REEL</span>
            <nav aria-label="Key earnings evidence pages">
              {EVIDENCE_PAGES.map((item) => (
                <button className={item.document === activeEvidence.document && item.page === activeEvidence.page ? "active" : ""} key={`${item.document}-${item.page}`} type="button" onClick={() => setActiveEvidence(item)}>
                  <small>{item.document === "deck" ? `P${item.page}` : `T${item.page}`}</small><strong>{item.label}</strong>
                </button>
              ))}
            </nav>
          </footer>
        </article>

        <aside className="qe-signal-room">
          <section className="qe-stage-panel">
            <header><span>14 DEPENDENT PASSES</span><strong>{Object.keys(stageResults).length}/14 COMPLETE</strong></header>
            <StageGrid activeStage={activeStage} selectedStage={selectedStage} stageResults={stageResults} running={running} onSelect={selectStage} />
            {researchSources.length > 0 && (
              <div className="qe-research">
                <span>PRIMARY SOURCES</span>
                {researchSources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}><i className={source.status === "fetched" ? "done" : ""} /><strong>{source.label}</strong><small>{source.status}</small></a>)}
              </div>
            )}
          </section>

          <section className="qe-output" ref={outputRef}>
            {error && <div className="qe-error"><span>REVIEW ERROR</span><p>{error}</p></div>}
            {!error && !visibleStage && <div className="qe-empty"><strong>54</strong><h2>Pages on deck</h2><p>2 documents · 7 chart images · 14 dependent model calls</p></div>}
            {!error && visibleStage && <StageFinding stage={visibleStage} payload={stageResults[visibleStage]} />}
          </section>
        </aside>
      </section>

      {finalResult && (
        <footer className="qe-stats">
          <span>{finalResult.pageCount} pages read</span><span>{finalResult.visualInputs} page images inspected</span><span>{finalResult.modelCalls} sequential model calls</span><span>{finalResult.researchSources.length} primary web sources</span><span>{finalResult.usage.input_tokens.toLocaleString()} input tokens</span><span>{finalResult.usage.output_tokens.toLocaleString()} output tokens</span><strong>{formatTime(finalResult.elapsedMs)}</strong>
        </footer>
      )}
    </main>
  );
}
