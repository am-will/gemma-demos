import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../shared/quant-base.css";
import "./qwen-sec.css";
import cerebrasLogo from "../../../llm-output-simulator/public/assets/cerebras-logo.png";

const PAGE_COUNT = 6;
const SOURCE_URL = "https://www.sec.gov/Archives/edgar/data/25232/000002523219000011/investorpresentation.pdf";

const PIPELINE_STEPS = [
  { key: "extract", label: "Read native PDF text" },
  { key: "render", label: "Render every page" },
  { key: "vision", label: "Inspect maps, tables, and footnotes" },
  { key: "result", label: "Write the cited event brief" }
];

function Brand() {
  return (
    <div className="qv-brand">
      <img src={cerebrasLogo} alt="" />
      <strong>CEREBRAS</strong>
    </div>
  );
}

function Connection({ status }) {
  const connected = status?.connected;
  return (
    <div className={`qv-connection ${connected ? "connected" : "offline"}`}>
      <i />
      <span>{connected ? "LOCAL API CONNECTED" : "LOCAL API UNAVAILABLE"}</span>
    </div>
  );
}

function ProgressRail({ events, running, complete }) {
  const completedKeys = new Set(events.map((event) => event.stage));
  const activeKey = running ? events.at(-1)?.stage : null;
  return (
    <div className="qv-progress">
      {PIPELINE_STEPS.map((step, index) => {
        const done = step.key === "result" ? complete : completedKeys.has(step.key);
        const active = step.key === activeKey || (step.key === "result" && running && activeKey === "vision");
        return (
          <div className={`${done ? "done" : ""} ${active ? "active" : ""}`} key={step.key}>
            <span>{done ? "✓" : String(index + 1).padStart(2, "0")}</span>
            <strong>{step.label}</strong>
            {active && <i />}
          </div>
        );
      })}
    </div>
  );
}

function EmptyResult() {
  return (
    <div className="qv-empty-result">
      <span>READY</span>
      <h2>Analyze the filing exhibit</h2>
      <p>Qwen will receive the extracted text and a rendered image of all six pages.</p>
    </div>
  );
}

function ResultBrief({ response }) {
  const { result, elapsedMs, pageCount, visualInputs, usage } = response;
  return (
    <article className="qv-result">
      <header>
        <div>
          <span>{result.classification}</span>
          <h2>{result.headline}</h2>
        </div>
        <strong>{result.confidence} confidence</strong>
      </header>

      <section className="qv-scope">
        <span>TRANSACTION SCOPE</span>
        <p>{result.transaction_scope}</p>
      </section>

      <div className="qv-split">
        <section>
          <span>SOLD</span>
          <p>{result.sold}</p>
        </section>
        <section>
          <span>RETAINED</span>
          <p>{result.retained}</p>
        </section>
      </div>

      <section className="qv-financial">
        <span>FINANCIAL IMPACT</span>
        <p>{result.financial_impact}</p>
      </section>

      <section className="qv-evidence">
        <div>
          <span>VISUAL EVIDENCE</span>
          <strong>PDF {result.source_pages.map((page) => `p.${page}`).join(", ")}</strong>
        </div>
        <p>{result.visual_evidence}</p>
      </section>

      <section className="qv-meaning">
        <span>WHY IT MATTERS</span>
        <p>{result.why_it_matters}</p>
      </section>

      <footer>
        <span>{pageCount} pages read</span>
        <span>{visualInputs} page images</span>
        <span>{usage?.input_tokens?.toLocaleString() || "-"} input tokens</span>
        <strong>{(elapsedMs / 1000).toFixed(1)}s</strong>
      </footer>
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
    lines.filter(Boolean).forEach((line) => onEvent(JSON.parse(line)));
    if (done) break;
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected PDF."));
    reader.readAsDataURL(file);
  });
}

export function QwenSecVisualReview() {
  const [status, setStatus] = useState(null);
  const [activePage, setActivePage] = useState(3);
  const [events, setEvents] = useState([]);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    fetch("/api/status")
      .then((result) => result.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false, model: "Qwen3.8-27B" }));
  }, []);

  const sourceLabel = useMemo(
    () => selectedFile?.name || "Project Fusion Investor Presentation",
    [selectedFile]
  );

  async function analyze() {
    setRunning(true);
    setResponse(null);
    setError("");
    setEvents([]);
    try {
      const payload = selectedFile
        ? { filename: selectedFile.name, fileData: await fileToDataUrl(selectedFile) }
        : {};
      const result = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      await readNdjson(result, (event) => {
        if (event.type === "progress") setEvents((current) => [...current, event]);
        if (event.type === "result") {
          setEvents((current) => [...current, { stage: "result" }]);
          setResponse(event);
        }
        if (event.type === "error") throw new Error(event.message);
      });
    } catch (caught) {
      setError(caught.message || "Document analysis failed.");
    } finally {
      setRunning(false);
    }
  }

  function chooseFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Choose a PDF file.");
      return;
    }
    setSelectedFile(file);
    setResponse(null);
    setEvents([]);
    setError("");
  }

  function useExample() {
    setSelectedFile(null);
    setActivePage(3);
    setResponse(null);
    setEvents([]);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <main className="qv-shell">
      <header className="qv-topbar">
        <Brand />
        <div className="qv-model">QWEN3.8-27B · MULTIMODAL</div>
        <Connection status={status} />
      </header>

      <section className="qv-intro">
        <div>
          <span>SEC DOCUMENT REVIEW</span>
          <h1>SEC Filing Visual Review</h1>
        </div>
        <p>Read the filing text and every page image. Determine what the issuer sold, what it retained, and why the distinction matters.</p>
      </section>

      <section className="qv-workbench">
        <article className="qv-document">
          <header>
            <div>
              <span>SEC EXHIBIT 99.1 · 6 PAGES</span>
              <h2>{sourceLabel}</h2>
            </div>
            {!selectedFile ? (
              <a href={SOURCE_URL} target="_blank" rel="noreferrer">OPEN SOURCE PDF</a>
            ) : (
              <button type="button" onClick={useExample}>USE EXAMPLE</button>
            )}
          </header>

          <div className={`qv-page-stage ${selectedFile ? "custom" : ""}`}>
            {selectedFile ? (
              <div className="qv-custom-file">
                <span>PDF</span>
                <h3>{selectedFile.name}</h3>
                <p>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB · ready for page rendering</p>
              </div>
            ) : (
              <img src={`/api/example/page/${activePage}`} alt={`Project Fusion PDF page ${activePage}`} />
            )}
            {!selectedFile && <div className="qv-page-number">PDF PAGE {activePage}</div>}
          </div>

          <footer>
            <nav aria-label="PDF pages">
              {Array.from({ length: PAGE_COUNT }, (_, index) => index + 1).map((page) => (
                <button
                  className={page === activePage ? "active" : ""}
                  key={page}
                  type="button"
                  onClick={() => setActivePage(page)}
                  disabled={Boolean(selectedFile)}
                >
                  {page}
                </button>
              ))}
            </nav>
            <button className="qv-upload" type="button" onClick={() => fileInput.current?.click()} disabled={running}>
              CHOOSE ANOTHER PDF
            </button>
            <input ref={fileInput} type="file" accept="application/pdf" onChange={chooseFile} hidden />
          </footer>
        </article>

        <aside className="qv-analysis">
          <header>
            <div>
              <span>LIVE DOCUMENT PIPELINE</span>
              <strong>{running ? "ANALYZING" : response ? "COMPLETE" : "READY"}</strong>
            </div>
            <button type="button" onClick={analyze} disabled={running || !status?.connected}>
              {running ? "Analyzing document" : response ? "Run again" : "Analyze document"}
            </button>
          </header>

          <ProgressRail events={events} running={running} complete={Boolean(response)} />

          <div className="qv-output">
            {error && <div className="qv-error"><span>ANALYSIS ERROR</span><p>{error}</p></div>}
            {!error && !response && <EmptyResult />}
            {!error && response && <ResultBrief response={response} />}
          </div>
        </aside>
      </section>
    </main>
  );
}
