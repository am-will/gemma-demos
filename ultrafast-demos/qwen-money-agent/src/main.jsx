import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { agents } from "./agents";
import "./style.css";
import { PromptIntro, HOME_PROMPT } from "./PromptIntro";
import { BrandEndingOverlay } from "./BrandEnding";
const money = (n, digits = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(n ?? 0);
function Icon({ name = "cerebras", size = 20, ...props }) {
  if (name === "cerebras")
    return (
      <img
        className="cerebras-icon"
        src="/assets/cerebras-mark.svg"
        alt="Cerebras"
        width={size}
        height={size}
        {...props}
      />
    );
  const paths = {
    chart: "M3 17l5-5 4 3 9-11M15 4h6v6",
    home: "M3 11l9-8 9 8M5 10v11h5v-7h4v7h5V10",
    receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3M9 8h6M9 12h6",
    flow: "M3 7h16l-4-4M21 17H5l4 4M19 7l-4 4M5 17l4-4",
    layers: "M3 8l9-5 9 5-9 5-9-5M3 12l9 5 9-5M3 16l9 5 9-5",
    debt: "M4 5h16v14H4V5M4 9h16M7 15h4",
    shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3M8 12l3 3 5-6",
    balance: "M12 3v18M5 21h14M4 7h16M6 7l-4 8h8L6 7M18 7l-4 8h8l-4-8",
    repeat:
      "M4 8a8 8 0 0113-3l3 3M20 3v5h-5M20 16a8 8 0 01-13 3l-3-3M4 21v-5h5",
    wallet: "M3 6h17v14H3V6M3 6l14-3v3M15 11h6v5h-6v-5",
    target:
      "M12 3a9 9 0 100 18 9 9 0 000-18M12 7a5 5 0 100 10 5 5 0 000-10M12 11v2",
    arrow: "M5 12h14M13 6l6 6-6 6",
    up: "M12 20V4M5 11l7-7 7 7",
    plus: "M12 5v14M5 12h14",
    check: "M5 12l4 4L19 6",
    close: "M6 6l12 12M18 6L6 18",
    stop: "M6 6h12v12H6z",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.wallet} />
    </svg>
  );
}
function Text({ text }) {
  return (
    <div className="answer-text">
      {text.split("\n").map((line, i) => (
        <div
          key={i}
          className={
            !line.trim() ? "paragraph-gap" : /^[-*] /.test(line) ? "bullet" : ""
          }
        >
          {line
            .replace(/^#{1,6}\s/, "")
            .replace(/^[-*] /, "• ")
            .split(/(\*\*[^*]+\*\*)/g)
            .map((part, j) =>
              part.startsWith("**") ? (
                <strong key={j}>{part.slice(2, -2)}</strong>
              ) : (
                part
              ),
            )}
        </div>
      ))}
    </div>
  );
}
function Evidence({ data }) {
  if (!data) return null;
  return (
    <section className="evidence">
      <div className="eyebrow">
        TOOL EVIDENCE <Icon name="check" size={14} />
      </div>
      <h3>{data.title}</h3>
      {data.kind === "portfolio" && (
        <>
          <div className="evidence-total negative">
            {money(data.change)} <small>{data.returnPct}%</small>
          </div>
          <p className="muted">{data.period} · Dollar contribution</p>
          {data.positions.map((p) => (
            <div className="position" key={p.symbol}>
              <div>
                <b>{p.symbol}</b>
                <span className={p.change < 0 ? "negative" : "positive"}>
                  {money(p.change)}
                </span>
              </div>
              <div className="bar-track">
                <i
                  className={p.change >= 0 ? "green" : ""}
                  style={{
                    width: `${Math.max(2, (Math.abs(p.change) / Math.max(...data.positions.map((x) => Math.abs(x.change)))) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </>
      )}
      {data.kind === "home" && (
        <>
          <div className="evidence-total">{money(data.maxDownPayment)}</div>
          <p className="muted">Available in {data.months} months</p>
          <dl>
            <dt>Cash today</dt>
            <dd>{money(data.startingCash)}</dd>
            <dt>New savings</dt>
            <dd>{money(data.monthlySavings * data.months)}</dd>
            {data.brokerageProceeds > 0 && (
              <>
                <dt>Brokerage (pre-tax)</dt>
                <dd>{money(data.brokerageProceeds)}</dd>
              </>
            )}
            <dt>Emergency reserve</dt>
            <dd>−{money(data.reserve)}</dd>
            <dt>Closing costs</dt>
            <dd>−{money(data.closingCosts)}</dd>
          </dl>
        </>
      )}
      {data.kind === "spending" && (
        <>
          <div className="evidence-total">{money(data.total)}</div>
          <p className="muted">{data.month} · Living expenses</p>
          {data.categories.map((c) => (
            <div className="position" key={c.name}>
              <div>
                <span>{c.name}</span>
                <b>{money(c.amount)}</b>
              </div>
              <div className="bar-track">
                <i style={{ width: `${(c.amount / data.total) * 100}%` }} />
              </div>
            </div>
          ))}
        </>
      )}
      {data.kind === "cashflow" && (
        <>
          <div className="evidence-total positive">
            {money(data.availableMonthly)}
          </div>
          <p className="muted">Available each month</p>
          <dl>
            <dt>Take-home income</dt>
            <dd>{money(data.monthlyNetIncome)}</dd>
            <dt>Living expenses</dt>
            <dd>−{money(data.livingExpenses)}</dd>
            <dt>Debt payments</dt>
            <dd>−{money(data.debtPayments)}</dd>
            <dt>Investments</dt>
            <dd>−{money(data.investmentContribution)}</dd>
          </dl>
        </>
      )}
      {data.kind === "rebalance" && (
        <>
          <div className="allocation">
            <div>
              <span>Before</span>
              <b>{data.beforeTechPct}%</b>
            </div>
            <Icon name="arrow" />
            <div>
              <span>After</span>
              <b>{data.afterTechPct}%</b>
            </div>
          </div>
          <p className="muted">Technology exposure</p>
          <p>
            {money(data.amount)} · {data.fromSymbol} → {data.toSymbol}
          </p>
        </>
      )}
      {data.kind === "debt" && (
        <>
          <div className="evidence-total">
            {data.monthsToDebtFree} <small>months</small>
          </div>
          <p className="muted">Estimated time to debt-free</p>
          <dl>
            <dt>Monthly payment</dt>
            <dd>{money(data.monthlyBudget)}</dd>
            <dt>Total interest</dt>
            <dd>{money(data.estimatedInterest)}</dd>
          </dl>
          {data.order.map((d, i) => (
            <p key={d} className="payoff-step">
              <span>{i + 1}</span>
              {d}
            </p>
          ))}
        </>
      )}
      {data.kind === "overview" && (
        <>
          <div className="evidence-total">{money(data.netWorth)}</div>
          <p className="muted">Net worth · Sep 9, 2026</p>
          <dl>
            <dt>Cash</dt>
            <dd>{money(data.cash)}</dd>
            <dt>Brokerage</dt>
            <dd>{money(data.brokerage)}</dd>
            <dt>Retirement</dt>
            <dd>{money(data.retirement)}</dd>
            <dt>Debts</dt>
            <dd>−{money(data.totalDebt)}</dd>
          </dl>
        </>
      )}
      <p className="evidence-note">
        {data.note ||
          data.assumptions ||
          data.basis ||
          "Fictional account snapshot. All amounts in USD."}
      </p>
      <details>
        <summary>View source data</summary>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </details>
    </section>
  );
}
function App() {
  const [intro, setIntro] = useState(!new URLSearchParams(location.search).has("assistant"));
  const [ending, setEnding] = useState(new URLSearchParams(location.search).get("ending") === "2");
  const composerRef = useRef(null);
  const endingTimer = useRef(null);
  const introRun = useRef(false);
  useEffect(() => () => clearTimeout(endingTimer.current), []);
  const [overview, setOverview] = useState(null),
    [status, setStatus] = useState(null),
    [initError, setInitError] = useState("");
  const [messages, setMessages] = useState([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [category, setCategory] = useState("All");
  const [selected, setSelected] = useState(""),
    [evidence, setEvidence] = useState(null),
    [mobileLibrary, setMobileLibrary] = useState(false);
  const session = useRef(null),
    controller = useRef(null),
    chatEnd = useRef(null),
    inputRef = useRef(null),
    sending = useRef(false);
  useEffect(() => {
    Promise.all([
      fetch("/api/overview").then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      }),
      fetch("/api/status").then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      }),
    ])
      .then(([o, s]) => {
        setOverview(o);
        setStatus(s);
      })
      .catch(() =>
        setInitError(
          "Could not load the demo. Check the local server and reload.",
        ),
      );
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    if (messages.length) {
      const scroller = chatEnd.current?.parentElement;
      scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length]);
  async function send(prompt, agentId = "") {
    if (sending.current || !prompt.trim()) return;
    sending.current = true;
    setBusy(true);
    setInput("");
    setSelected(agentId);
    setMobileLibrary(false);
    const id = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { role: "user", text: prompt },
      {
        id,
        role: "assistant",
        text: "",
        tools: [],
        status: "Starting your analysis",
      },
    ]);
    const update = (fn) =>
      setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
    controller.current = new AbortController();
    let terminal = false;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, sessionId: session.current }),
        signal: controller.current.signal,
      });
      if (!response.ok) {
        const error = await response.json();
        throw Error(error.error || "Unable to start analysis.");
      }
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      function event(e) {
        if (e.type === "session") session.current = e.sessionId;
        if (e.type === "status") update((m) => ({ ...m, status: e.text }));
        if (e.type === "tool_start")
          update((m) => ({
            ...m,
            tools: [...m.tools, { ...e, running: true }],
          }));
        if (e.type === "tool_result") {
          update((m) => ({
            ...m,
            tools: m.tools.map((t) =>
              t.id === e.id ? { ...t, running: false, data: e.data } : t,
            ),
          }));
          if (!e.data.error) setEvidence(e.data);
        }
        if (e.type === "answer")
          update((m) => ({ ...m, text: e.text, status: "" }));
        if (e.type === "done") {
          terminal = true;
          update((m) => ({ ...m, stats: e, status: "" }));
          if (introRun.current) {
            introRun.current = false;
            endingTimer.current = setTimeout(() => setEnding(true), 3700);
          }
        }
        if (e.type === "error") {
          terminal = true;
          throw Error(e.message);
        }
      }
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) if (line.trim()) event(JSON.parse(line));
      }
      if (buffer.trim()) event(JSON.parse(buffer));
      if (!terminal)
        throw Error(
          "Connection ended before the analysis finished. Please retry.",
        );
    } catch (error) {
      introRun.current = false;
      clearTimeout(endingTimer.current);
      update((m) => ({
        ...m,
        status: "",
        error:
          error.name === "AbortError"
            ? "Analysis stopped. You can ask another question."
            : error.message,
        retryPrompt: prompt,
        tools: m.tools.map((t) => ({ ...t, running: false })),
      }));
    } finally {
      sending.current = false;
      setBusy(false);
      controller.current = null;
    }
  }
  function reset() {
    if (busy) return;
    session.current = null;
    setMessages([]);
    setEvidence(null);
    setSelected("");
    setInput("");
    inputRef.current?.focus();
  }
  const disabled = busy || !status?.configured;
  const starters = [agents[0], agents[1], agents[2], agents[5]];
  const shortPrompts = [
    "Why is my portfolio down this week?",
    "What’s the largest down payment I can afford?",
    "Where is my money going?",
    "How can I pay off my debt faster?",
  ];
  return (
    <div className={`app${intro ? " money-app-intro" : ""}`}>
      {intro && !ending && <PromptIntro ready={!!overview && !!status?.configured} error={initError || (status && !status.configured ? "Configure the Cerebras API key, then reload to start." : "")} targetRef={composerRef} onDock={() => setInput(HOME_PROMPT)} onComplete={() => { setIntro(false); introRun.current = true; send(HOME_PROMPT, "home"); }} />}
      {ending && <BrandEndingOverlay variant="2" sequenceKey={1} />}
      <div className="workspace" inert={intro || ending ? true : undefined}>
        <aside className={`library ${mobileLibrary ? "mobile-open" : ""}`}>
          <div className="library-heading">
            <span className="eyebrow">
              YOUR AGENTS <span>12</span>
            </span>
            <button
              className="mobile-close icon-button"
              onClick={() => setMobileLibrary(false)}
              aria-label="Close agents"
            >
              <Icon name="close" />
            </button>
          </div>
          <h2>
            Purpose built
            <br />
            for every question.
          </h2>
          <div className="filters" aria-label="Filter agents">
            {["All", "Everyday", "Investing", "Planning"].map((c) => (
              <button
                key={c}
                className={category === c ? "active" : ""}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="agent-list">
            {agents
              .filter((a) => category === "All" || a.category === category)
              .map((a) => (
                <button
                  key={a.id}
                  className={`agent ${selected === a.id ? "selected" : ""}`}
                  disabled={disabled}
                  onClick={() => send(a.prompt, a.id)}
                  title={a.prompt}
                >
                  <span className="agent-icon">
                    <Icon name={a.icon} />
                  </span>
                  <span>
                    <b>{a.name}</b>
                    <small>{a.description}</small>
                  </span>
                  <span className="agent-arrow">↗</span>
                </button>
              ))}
          </div>
        </aside>
        <main className="conversation">
          <div className="conversation-bar">
            <div>
              <span className="live-dot" />
              Your financial assistant
            </div>
            <div className="conversation-actions">
              <button
                className="mobile-agents"
                onClick={() => setMobileLibrary(true)}
              >
                Agents
              </button>
              <button onClick={reset} disabled={busy || !messages.length}>
                <Icon name="plus" size={15} /> New chat
              </button>
            </div>
          </div>
          <div className={`chat-scroll ${!messages.length ? "is-empty" : ""}`}>
            {!messages.length ? (
              <div className="welcome">
                <div className="welcome-mark">
                  <Icon name="cerebras" size={30} />
                </div>
                <div className="eyebrow">A CLEARER PICTURE OF YOUR MONEY</div>
                <h1>
                  Your finances.
                  <br />
                  <span>Let’s talk about them.</span>
                </h1>
                <p>
                  Ask a question. Explore a what-if.
                  <br />
                  Get answers grounded in your financial picture.
                </p>
                <div className="starters">
                  {starters.map((a, i) => (
                    <button
                      key={a.id}
                      onClick={() => send(a.prompt, a.id)}
                      disabled={disabled}
                    >
                      <Icon name={a.icon} />
                      <span>{shortPrompts[i]}</span>
                      <Icon name="arrow" size={17} />
                    </button>
                  ))}
                </div>
                <div className="connected-note">
                  <span className="mini-check">
                    <Icon name="check" size={12} />
                  </span>
                  Accounts, investments & transactions connected
                </div>
              </div>
            ) : (
              <div className="messages">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="user-message">
                      <div>{m.text}</div>
                      <img
                        className="avatar"
                        src="/assets/alex-morgan.png"
                        alt="Alex Morgan"
                      />
                    </div>
                  ) : (
                    <article className="assistant-message" key={m.id}>
                      <div className="assistant-label">
                        <span className="assistant-avatar">
                          <img src="/assets/cerebras-mark.svg" alt="Cerebras" />
                        </span>
                        <b>Money Agent</b>
                        <span>Qwen</span>
                      </div>
                      {m.tools.length > 0 && (
                        <div className="tool-list">
                          {m.tools.map((t) => (
                            <button
                              key={t.id}
                              disabled={!t.data || !!t.data.error}
                              onClick={() => setEvidence(t.data)}
                              className={t.data?.error ? "tool-error" : ""}
                            >
                              <span
                                className={t.running ? "spinner" : "tool-check"}
                              >
                                {!t.running && (
                                  <Icon
                                    name={t.data?.error ? "close" : "check"}
                                    size={13}
                                  />
                                )}
                              </span>
                              {t.label || t.name}
                              {t.data && !t.data.error && (
                                <span className="view-evidence">View ↗</span>
                              )}
                              {t.data?.error && <span>Needs adjustment</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      {m.status && (
                        <div className="thinking" role="status">
                          <span />
                          {m.status}…
                        </div>
                      )}
                      {m.text && <Text text={m.text} />}
                      <div className="inline-evidence">
                        {m.tools.some((t) => t.data === evidence) && (
                          <Evidence data={evidence} />
                        )}
                      </div>{" "}
                      {m.error && (
                        <div className="error" role="alert">
                          {m.error}
                          {m.retryPrompt && (
                            <button
                              disabled={disabled}
                              onClick={() => send(m.retryPrompt)}
                            >
                              Retry question <Icon name="repeat" size={14} />
                            </button>
                          )}
                        </div>
                      )}
                      {m.stats && (
                        <div className="response-stats">
                          <span>
                            <Icon name="check" size={12} /> Complete
                          </span>
                          <span>{(m.stats.elapsedMs / 1000).toFixed(1)}s</span>
                          <span>
                            {m.stats.toolCount} tool{" "}
                            {m.stats.toolCount === 1 ? "call" : "calls"}
                          </span>
                        </div>
                      )}
                    </article>
                  ),
                )}
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <div className="composer-area">
            {initError && (
              <p className="error" role="alert">
                {initError}
              </p>
            )}
            {status && !status.configured && (
              <p className="error" role="alert">
                Add CEREBRAS_API_KEY to the repository .env, then restart to
                enable analysis.
              </p>
            )}
            <form
              ref={composerRef}
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <textarea
                ref={inputRef}
                aria-label="Ask about your finances"
                placeholder="Ask anything about your finances…"
                value={input}
                maxLength={4000}
                rows={2}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    if (!disabled) send(input);
                  }
                }}
              />
              <div className="composer-bottom">
                <span>
                  <Icon name="layers" size={14} /> Alex’s financial data{" "}
                  <span className="context-dot" />
                </span>
                {busy ? (
                  <button
                    type="button"
                    className="send-button stop"
                    aria-label="Stop analysis"
                    onClick={() => controller.current?.abort()}
                  >
                    <Icon name="stop" size={17} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="send-button"
                    aria-label="Send question"
                    disabled={!input.trim() || disabled}
                  >
                    <Icon name="up" size={20} />
                  </button>
                )}
              </div>
            </form>
            <p className="disclaimer">
              Fictional finances. Real AI analysis. Scenarios only; no money
              moves.
            </p>
          </div>
        </main>
        <aside className="financial-panel">
          <div className="profile">
            <img
              className="profile-avatar"
              src="/assets/alex-morgan.png"
              alt="Alex Morgan"
            />
            <div>
              <strong>Alex Morgan</strong>
              <span>Personal financial picture</span>
            </div>
          </div>
          {overview && (
            <>
              <section className="networth">
                <div className="eyebrow">
                  NET WORTH <span>USD</span>
                </div>
                <strong>{money(overview.netWorth)}</strong>
                <span className="snapshot">Snapshot · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
              </section>
              {evidence ? (
                <>
                  <button
                    className="back-overview"
                    onClick={() => setEvidence(null)}
                  >
                    ← Account overview
                  </button>
                  <Evidence data={evidence} />
                </>
              ) : (
                <>
                  <section className="balances">
                    <div className="section-label">
                      Your accounts <span>5 connected</span>
                    </div>
                    {[
                      ["Cash & savings", overview.cash, "wallet"],
                      ["Brokerage", overview.brokerage, "chart"],
                      ["Retirement", overview.retirement, "shield"],
                      ["Total debt", overview.totalDebt, "debt"],
                    ].map(([name, value, icon]) => (
                      <div className="balance-row" key={name}>
                        <Icon name={icon} size={17} />
                        <span>{name}</span>
                        <b>{money(value)}</b>
                      </div>
                    ))}
                  </section>
                  <section className="weekly">
                    <div className="section-label">Portfolio this week</div>
                    <div className="weekly-number">
                      {money(overview.weekChange)}
                      <span>{overview.weekReturnPct}%</span>
                    </div>
                    <svg
                      viewBox="0 0 260 56"
                      aria-label="Illustrative weekly portfolio trend with daily fluctuations and an overall decline"
                      role="img"
                    >
                      <path
                        d="M2 10 L9 13 L16 8 L23 15 L30 12 L37 20 L44 17 L51 23 L58 19 L65 15 L72 21 L79 18 L86 26 L93 24 L100 31 L107 27 L114 33 L121 29 L128 23 L135 28 L142 25 L149 34 L156 31 L163 38 L170 34 L177 41 L184 36 L191 39 L198 32 L205 36 L212 42 L219 39 L226 46 L233 42 L240 48 L247 44 L258 48"
                        fill="none"
                        stroke="#e16b48"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                    <button
                      disabled={disabled}
                      onClick={() => send(agents[0].prompt, "portfolio")}
                    >
                      Understand the change <Icon name="arrow" size={15} />
                    </button>
                  </section>
                  <section className="goal">
                    <div className="section-label">
                      <Icon name="home" size={17} /> First home
                    </div>
                    <strong>
                      {money(overview.cash)} <span>/ $100,000</span>
                    </strong>
                    <div className="goal-progress">
                      <i
                        style={{
                          width: `${Math.min(100, (overview.cash / 100000) * 100)}%`,
                        }}
                      />
                    </div>
                    <p>
                      Total cash toward target, before reserves.
                      <br />
                      Target date · September 2027
                    </p>
                  </section>
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
