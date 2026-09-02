import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../shared/quant-base.css";
import "./qwen-deal.css";
import cerebrasLogo from "../../../llm-output-simulator/public/assets/cerebras-logo.png";

const SOURCE_URL = "https://www.sec.gov/Archives/edgar/data/718937/000121390025095514/ea0259891-dfan14a_broadwood.pdf";
const REVIEW_PAGES = [41, 42, 43, 44, 45];
const DEFAULT_CHALLENGE = "The $28 offer sits inside management's revised DCF range. Does that make the transaction fair?";

const STAGES = [
  { id: "triage", label: "Document triage", detail: "Read all 81 pages", page: null },
  { id: "process", label: "Sale process", detail: "Inspect timeline chart", page: 41 },
  { id: "projections", label: "Projections", detail: "Compare both chart series", page: 42 },
  { id: "dcf", label: "DCF range", detail: "Trace forecast to value", page: 43 },
  { id: "discount", label: "Discount rate", detail: "Compare WACC evidence", page: 44 },
  { id: "alternatives", label: "Valuation cross-check", detail: "Test the $28 offer", page: 45 },
  { id: "proxyResearch", label: "SEC proxy research", detail: "Fetch the company filing", page: null },
  { id: "companyResearch", label: "Company response", detail: "Check official sources", page: null },
  { id: "assessment", label: "Deal brief", detail: "Synthesize the evidence", page: null },
  { id: "challenge", label: "Analyst challenge", detail: "Revise the conclusion", page: null }
];

function Brand() {
  return (
    <div className="qd-brand">
      <img src={cerebrasLogo} alt="" />
      <strong>CEREBRAS</strong>
    </div>
  );
}

function formatTime(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function decisionLabel(value) {
  return humanizeText(value);
}

function humanizeText(value) {
  const replacements = {
    supports_offer: "supports the offer",
    opposes_offer: "opposes the offer",
    insufficient_evidence: "insufficient evidence"
  };
  const anonymous = String(value ?? "")
    .replace(/\bSTAAR Surgical(?: Company)?\b/gi, "the issuer")
    .replace(/\bSTAAR\b/gi, "the issuer")
    .replace(/\bAlcon(?: Inc\.?| AG)?\b/gi, "the buyer")
    .replace(/\bBroadwood Partners\b/gi, "the opposing stockholder")
    .replace(/\bBroadwood\b/gi, "the opposing stockholder");
  return anonymous.replace(/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/gi, (token) => (
    replacements[token.toLowerCase()] || token.replaceAll("_", " ")
  ));
}

function capitalizeFirst(value) {
  const text = String(value ?? "");
  const firstLetter = text.search(/[A-Za-z]/);
  if (firstLetter < 0) return text;
  return `${text.slice(0, firstLetter)}${text[firstLetter].toUpperCase()}${text.slice(firstLetter + 1)}`;
}

function compactText(value, maxSentences = 2, maxCharacters = 360) {
  const text = capitalizeFirst(humanizeText(value).trim());
  const protectedText = text.replace(/(\d)\.(\d)/g, "$1\u0000$2");
  const sentences = protectedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [protectedText];
  const selected = sentences.slice(0, maxSentences).join(" ").trim().replaceAll("\u0000", ".");
  if (selected.length <= maxCharacters) return selected;
  const clipped = selected.slice(0, maxCharacters);
  return `${clipped.slice(0, clipped.lastIndexOf(" "))}…`;
}

function splitSentences(value) {
  const protectedText = capitalizeFirst(humanizeText(value)).replace(/(\d)\.(\d)/g, "$1\u0000$2");
  return (protectedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [protectedText])
    .map((sentence) => sentence.trim().replaceAll("\u0000", "."))
    .filter(Boolean);
}

function FindingHeadline({ children }) {
  const text = capitalizeFirst(humanizeText(children));
  return (
    <div className="qd-narrative">
      {splitSentences(text).map((sentence, index) => <p key={`${index}-${sentence}`}>{sentence}</p>)}
    </div>
  );
}

function SupportingDetail({ children, label = "Supporting detail" }) {
  return (
    <section className="qd-detail qd-detail-static">
      <header className="qd-detail-heading">{label}</header>
      <div>{children}</div>
    </section>
  );
}

function StageRail({ activeStage, selectedStage, stageResults, running, onSelect }) {
  return (
    <ol className="qd-stage-rail">
      {STAGES.map((stage, index) => {
        const complete = Boolean(stageResults[stage.id]);
        const active = stage.id === activeStage;
        const selected = stage.id === selectedStage;
        return (
          <li className={`${complete ? "complete" : ""} ${active ? "active" : ""} ${selected ? "selected" : ""}`} key={stage.id}>
            <button type="button" disabled={!complete} onClick={() => onSelect(stage)} aria-pressed={selected}>
              <span className="qd-stage-index">{complete ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <span className="qd-stage-copy">
                <strong>{stage.label}</strong>
                <small>{active && running ? "RUNNING" : complete ? formatTime(stageResults[stage.id].elapsedMs) : stage.detail}</small>
              </span>
              {active && running && <i className="qd-spinner" />}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Citation({ pages = [] }) {
  return <span className="qd-citation">{pages.map((page) => `PDF ${page}`).join(" · ")}</span>;
}

function SourceLinks({ urls = [] }) {
  return (
    <div className="qd-source-links">
      {urls.map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}>SOURCE {index + 1}</a>)}
    </div>
  );
}

function KeyValue({ label, children }) {
  return (
    <div className="qd-key-value">
      <span>{label}</span>
      <p>{capitalizeFirst(humanizeText(children))}</p>
    </div>
  );
}

function StageFinding({ stage, payload }) {
  if (!payload) return null;
  const data = payload.result;

  if (stage === "triage") {
    return (
      <article className="qd-finding">
        <header><span>TRIAGE COMPLETE</span><Citation pages={data.source_pages} /></header>
        <FindingHeadline>{data.core_question}</FindingHeadline>
        <ul>{data.initial_signals.slice(0, 2).map((signal) => <li key={signal}>{compactText(signal, 1, 170)}</li>)}</ul>
        <SupportingDetail>
          <KeyValue label="TRANSACTION">{data.transaction}</KeyValue>
        </SupportingDetail>
      </article>
    );
  }

  if (stage === "process") {
    return (
      <article className="qd-finding">
        <header><span>SALE-PROCESS REVIEW</span><Citation pages={data.source_pages} /></header>
        <FindingHeadline>{data.finding}</FindingHeadline>
        <div className="qd-process-math">
          <KeyValue label="ISSUER PROCESS">{data.staar_days} days</KeyValue>
          <KeyValue label="PRECEDENT MEDIAN">{data.median_days} days</KeyValue>
          <KeyValue label="HALF THE MEDIAN">{data.half_median_days} days</KeyValue>
        </div>
        <SupportingDetail>
          <KeyValue label="PEER COMPARISON">{data.peer_comparison}</KeyValue>
          <KeyValue label="EVIDENCE">{data.evidence}</KeyValue>
          <p className="qd-caveat">{data.limitation}</p>
        </SupportingDetail>
      </article>
    );
  }

  if (stage === "projections") {
    return (
      <article className="qd-finding">
        <header><span>PROJECTION COMPARISON</span><Citation pages={data.source_pages} /></header>
        <FindingHeadline>{data.finding}</FindingHeadline>
        <div className="qd-metric-table">
          <div><span>METRIC</span><span>INITIAL</span><span>REVISED</span><span>CHANGE</span></div>
          {data.metrics.map((metric) => (
            <div key={`${metric.metric}-${metric.period}`}>
              <strong>{metric.metric}<small>{metric.period}</small></strong>
              <span>{metric.initial}</span>
              <span>{metric.revised}</span>
              <em>{metric.change}</em>
            </div>
          ))}
        </div>
        <p className="qd-callout">{compactText(data.open_question, 1, 220)}</p>
      </article>
    );
  }

  if (stage === "dcf") {
    return (
      <article className="qd-finding">
        <header><span>DCF RANGE REVIEW</span><Citation pages={data.source_pages} /></header>
        <FindingHeadline>{data.finding}</FindingHeadline>
        <div className="qd-range-grid">
          <KeyValue label="INITIAL PROJECTIONS">{data.initial_range}</KeyValue>
          <KeyValue label="REVISED PROJECTIONS">{data.revised_range}</KeyValue>
        </div>
        <KeyValue label="OFFER POSITION">{data.offer_position}</KeyValue>
        <SupportingDetail>
          <p className="qd-caveat">{data.methodology_caveat}</p>
        </SupportingDetail>
      </article>
    );
  }

  if (stage === "discount") {
    return (
      <article className="qd-finding">
        <header><span>DISCOUNT-RATE REVIEW</span><Citation pages={data.source_pages} /></header>
        <FindingHeadline>{compactText(data.finding, 1, 240)}</FindingHeadline>
        <div className="qd-rate-row">
          <KeyValue label="ADVISOR RATE">{data.advisor_rate}</KeyValue>
          <KeyValue label="COMPARISON RATES">{data.comparison_rates}</KeyValue>
        </div>
        <KeyValue label="VALUATION EFFECT">{data.valuation_effect}</KeyValue>
        <SupportingDetail>
          <p className="qd-caveat">{data.caveat}</p>
        </SupportingDetail>
      </article>
    );
  }

  if (stage === "alternatives") {
    return (
      <article className="qd-finding">
        <header><span>ALTERNATIVE VALUATION</span><Citation pages={data.source_pages} /></header>
        <FindingHeadline>{compactText(data.finding, 1, 220)}</FindingHeadline>
        <div className="qd-valuations">
          <KeyValue label="ADVISOR RANGE">{data.advisor_range}</KeyValue>
          <KeyValue label="REVISED + COMPANY WACC">{data.revised_at_company_wacc_range}</KeyValue>
          <KeyValue label="INITIAL + COMPANY WACC">{data.initial_at_company_wacc_range}</KeyValue>
        </div>
      </article>
    );
  }

  if (stage === "proxyResearch") {
    return (
      <article className="qd-finding qd-web-finding">
        <header><span>PRIMARY-SOURCE RESEARCH</span><SourceLinks urls={[data.source_url]} /></header>
        <div className="qd-web-mark"><span>WEB</span><strong>{data.source}</strong></div>
        <KeyValue label="PROJECTION REVISION">{compactText(data.projection_revision_disclosure, 2, 280)}</KeyValue>
        <KeyValue label="BOARD PROCESS">{compactText(data.board_process_rationale, 1, 220)}</KeyValue>
        <SupportingDetail>
          <KeyValue label="DISCOUNT RATE">{data.discount_rate_disclosure}</KeyValue>
          <KeyValue label="CONFIRMS">{data.what_it_confirms}</KeyValue>
          <KeyValue label="DOES NOT CONFIRM">{data.what_it_does_not_confirm}</KeyValue>
        </SupportingDetail>
      </article>
    );
  }

  if (stage === "companyResearch") {
    return (
      <article className="qd-finding qd-web-finding">
        <header><span>COMPANY COUNTERCASE</span><SourceLinks urls={data.source_urls} /></header>
        <div className="qd-web-mark"><span>WEB</span><strong>{data.source}</strong></div>
        <KeyValue label="OFFER PREMIUM">{compactText(data.offer_premium_case, 2, 260)}</KeyValue>
        <KeyValue label="STANDALONE RISKS">{compactText(data.standalone_risks, 2, 260)}</KeyValue>
        <p className="qd-callout">{compactText(data.what_changes, 1, 220)}</p>
        <SupportingDetail>
        <div className="qd-range-grid">
          <KeyValue label="PROCESS RESPONSE">{data.process_response}</KeyValue>
          <KeyValue label="VALUATION RESPONSE">{data.valuation_response}</KeyValue>
        </div>
        </SupportingDetail>
      </article>
    );
  }

  if (stage === "assessment") {
    return (
      <article className="qd-finding qd-assessment">
        <header><span>DEAL BRIEF</span></header>
        <div className="qd-decision-line">
          <strong>{decisionLabel(data.deal_view)}</strong>
          <span>{data.confidence} confidence</span>
        </div>
        <FindingHeadline>{data.headline}</FindingHeadline>
        <p className="qd-conclusion">{compactText(data.conclusion, 2, 320)}</p>
        <SupportingDetail label="Evidence and open questions">
          <ul>{data.strongest_evidence.map((item) => <li key={item}>{item}</li>)}</ul>
          <KeyValue label="COUNTERARGUMENT">{data.counterargument}</KeyValue>
          <Citation pages={data.source_pages} />
          <SourceLinks urls={data.source_urls} />
        </SupportingDetail>
      </article>
    );
  }

  if (stage === "challenge") {
    return (
      <article className="qd-finding qd-revision">
        <header><span>DEAL BRIEF</span></header>
        <div className="qd-decision-line">
          <strong>{decisionLabel(data.decision)}</strong>
          <span>{data.confidence} confidence</span>
        </div>
        <blockquote>{data.challenge}</blockquote>
        <div className="qd-answer">
          {splitSentences(data.answer).map((sentence, index) => <p key={`${index}-${sentence}`}>{sentence}</p>)}
        </div>
        <SupportingDetail label="Full analysis">
          <div className="qd-conclusion">
            {splitSentences(data.revised_conclusion).map((sentence, index) => <p key={`${index}-${sentence}`}>{sentence}</p>)}
          </div>
          <div className="qd-range-grid">
            <KeyValue label="WHAT CHANGED">{data.what_changed}</KeyValue>
            <KeyValue label="WHAT DID NOT">{data.what_did_not_change}</KeyValue>
          </div>
          <SourceLinks urls={data.source_urls} />
        </SupportingDetail>
      </article>
    );
  }

  return (
    <article className="qd-finding">
      <header><span>{stage === "process" ? "SALE-PROCESS REVIEW" : "FINDING"}</span><Citation pages={data.source_pages} /></header>
      <FindingHeadline>{data.finding}</FindingHeadline>
      {data.peer_comparison && <KeyValue label="PEER COMPARISON">{data.peer_comparison}</KeyValue>}
      {data.evidence && <KeyValue label="EVIDENCE">{data.evidence}</KeyValue>}
      {data.limitation && <p className="qd-caveat">{data.limitation}</p>}
    </article>
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

export function QwenSecDealReview() {
  const [status, setStatus] = useState(null);
  const [running, setRunning] = useState(false);
  const [activeStage, setActiveStage] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [activePage, setActivePage] = useState(42);
  const [stageResults, setStageResults] = useState({});
  const [finalResult, setFinalResult] = useState(null);
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState(DEFAULT_CHALLENGE);
  const [startedAt, setStartedAt] = useState(null);
  const [clock, setClock] = useState(0);
  const [researchSources, setResearchSources] = useState([]);
  const outputRef = useRef(null);

  useEffect(() => {
    fetch("/api/status")
      .then((result) => result.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false, model: "Qwen3.8-27B" }));
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
    return (
      (selectedStage && stageResults[selectedStage] ? selectedStage : null)
      || (activeStage && stageResults[activeStage] ? activeStage : completed.at(-1)?.id)
      || null
    );
  }, [activeStage, selectedStage, stageResults]);

  function selectStage(stage) {
    if (!stageResults[stage.id]) return;
    setSelectedStage(stage.id);
    if (stage.page) setActivePage(stage.page);
    outputRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function analyze() {
    setRunning(true);
    setStageResults({});
    setFinalResult(null);
    setError("");
    setActiveStage("triage");
    setSelectedStage(null);
    setActivePage(42);
    const start = performance.now();
    setStartedAt(start);
    setClock(0);
    setResearchSources([]);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge })
      });
      await readNdjson(response, (event) => {
        if (event.type === "stage_start") {
          setActiveStage(event.stage);
          if (event.page) setActivePage(event.page);
        }
        if (event.type === "stage_result") {
          setStageResults((current) => ({ ...current, [event.stage]: event }));
          window.setTimeout(() => outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: "smooth" }), 0);
        }
        if (event.type === "research_source") {
          setResearchSources((current) => {
            const next = current.filter((source) => source.url !== event.url);
            return [...next, event];
          });
        }
        if (event.type === "result") {
          setFinalResult(event);
          setClock(event.elapsedMs);
        }
        if (event.type === "error") throw new Error(event.message);
      });
    } catch (caught) {
      setError(caught.message || "Deal review failed.");
    } finally {
      setRunning(false);
      setActiveStage(null);
    }
  }

  return (
    <main className="qd-shell">
      <header className="qd-topbar">
        <Brand />
        <div className="qd-model">QWEN3.8-27B · MULTIMODAL</div>
      </header>

      <section className="qd-intro">
        <div>
          <span>SEC TRANSACTION REVIEW</span>
          <h1>SEC Visual Deal Review</h1>
        </div>
      </section>

      <section className="qd-command">
        <div className="qd-source">
          <span>SEC DFAN14A · 81 PAGES</span>
          <strong>Public merger filing and shareholder materials</strong>
        </div>
        <div className="qd-clock">
          <span>{running ? "REVIEW RUNNING" : finalResult ? "REVIEW COMPLETE" : "READY"}</span>
          <strong>{formatTime(clock)}</strong>
        </div>
        <button type="button" onClick={analyze} disabled={running || !status?.connected}>
          {running ? "Reviewing document" : finalResult ? "Run full review again" : "Start full review"}
        </button>
      </section>

      <section className="qd-challenge-bar">
        <div>
          <span>ANALYST CHALLENGE</span>
          <strong>Applied after the first deal brief</strong>
        </div>
        <textarea value={challenge} onChange={(event) => setChallenge(event.target.value)} disabled={running} rows={2} />
      </section>

      <section className="qd-workbench">
        <article className="qd-document">
          <header>
            <div>
              <span>DOCUMENT EVIDENCE</span>
              <strong>{activePage ? `PDF PAGE ${activePage}` : "FULL DOCUMENT"}</strong>
            </div>
            <a href={SOURCE_URL} target="_blank" rel="noreferrer">OPEN SEC SOURCE</a>
          </header>

          <div className="qd-page-stage">
            <img src={`/api/example/page/${activePage}`} alt={`SEC presentation page ${activePage}`} />
            {running && <div className="qd-scan-line" />}
          </div>

          <footer>
            <nav aria-label="Key evidence pages">
              {REVIEW_PAGES.map((page) => (
                <button className={page === activePage ? "active" : ""} key={page} type="button" onClick={() => setActivePage(page)}>
                  {page}
                </button>
              ))}
            </nav>
            <span>KEY VALUATION PAGES</span>
          </footer>
        </article>

        <aside className="qd-review">
          <section className="qd-pipeline">
            <header>
              <span>SEQUENTIAL REVIEW</span>
              <strong>{Object.keys(stageResults).length}/10 MODEL CALLS</strong>
            </header>
            <StageRail
              activeStage={activeStage}
              selectedStage={selectedStage}
              stageResults={stageResults}
              running={running}
              onSelect={selectStage}
            />
            {researchSources.length > 0 && (
              <div className="qd-research-log">
                <span>LIVE WEB SOURCES</span>
                {researchSources.map((source) => (
                  <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                    <i className={source.status === "fetched" ? "done" : ""} />
                    <strong>{source.label}</strong>
                    <small>{source.status}</small>
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="qd-output" ref={outputRef}>
            {error && <div className="qd-error"><span>REVIEW ERROR</span><p>{error}</p></div>}
            {!error && !visibleStage && (
              <div className="qd-empty">
                <span>81</span>
                <h2>Pages ready</h2>
                <p>5 charts · 3 web sources · 10 model calls</p>
              </div>
            )}
            {!error && visibleStage && <StageFinding stage={visibleStage} payload={stageResults[visibleStage]} />}
          </section>
        </aside>
      </section>

      {finalResult && (
        <footer className="qd-run-stats">
          <span>{finalResult.pageCount} pages read</span>
          <span>{finalResult.visualInputs} chart images inspected</span>
          <span>{finalResult.modelCalls} sequential model calls</span>
          <span>{finalResult.researchSources.length} web sources checked</span>
          <span>{finalResult.usage.input_tokens.toLocaleString()} input tokens</span>
          <span>{finalResult.usage.output_tokens.toLocaleString()} output tokens</span>
          <strong>{formatTime(finalResult.elapsedMs)}</strong>
        </footer>
      )}
      <footer className="qd-legal">
        Uses publicly available financial documents. No endorsement, partnership, or affiliation is implied. AI-generated analysis may be inaccurate and is not investment advice or a stock recommendation.
      </footer>
    </main>
  );
}
