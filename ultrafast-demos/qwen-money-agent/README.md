# Money Agent

A Qwen financial assistant using real Cerebras inference and tools over a fictional USD account snapshot dated September 9, 2026. Matches the existing orange / warm-white Qwen demos.

From this directory:

```sh
npm run dev
```

Open http://127.0.0.1:5196. Uses the parent `ultrafast-demos/node_modules` dependencies. If missing, run `npm install` in `ultrafast-demos` first. The server loads `CEREBRAS_API_KEY` from the repository-root `.env` (or process environment). Optional `MONEY_AGENT_MODEL` overrides the default `qwen-3.8-27b`. Credentials remain server-side. Restart after changing configuration. `npm run build`, `npm test`, and `npm run preview` are also available. Preview serves the API on port 4196.

## Experience

Twelve specialist starter prompts launch one tool-using assistant; they are not twelve independently running models. Users can type arbitrary questions and follow-ups. The server maintains conversation/tool history in memory for one hour; New chat resets the client session. Conversations are lost on server restart. No browser persistence of financial conversations. The context is bounded; start a new chat when full.

Seven native function-calling tools calculate portfolio contributions and ETF tech overlap, expense transactions, cash flow, down-payment scenarios, hypothetical rebalancing, and debt payoff. Actual tool results appear beside the conversation with expandable JSON source data. Small-screen layouts put evidence below the relevant response. Activity indicates tool execution and answer preparation, not private model reasoning. Latency measures the full model/tool loop; no synthetic delays or benchmark speedup claims.

No external financial data or real accounts. Retirement holdings, tax basis, mortgage underwriting and market news are unavailable. Financial tools are read-only; hypothetical allocations do not execute trades or move funds. The default home scenario includes six months of living expenses and debt payments in reserves, $12,000 closing costs, continued regular investing, and no investment returns or brokerage sales. Mortgage qualification is not calculated. Public hosting, user authentication and persistent storage are outside this local demo's scope.

## Presentation flow

The default route types a text-only home-buying prompt, docks the opening composer into the assistant, pauses, then animates a cursor press before making one live API request. Typing the follow-up starts 2.5 seconds after the first request. It waits for the first response to complete before clicking Send, preserving the conversation. A successful second completion holds the answer for 3 seconds, then shows the supplied 16x speed bumper and Cerebras/Qwen lockup. The speed statement is supplied campaign copy, not a measurement calculated by this demo. Errors and stopped requests do not trigger the ending.

Use `?assistant=1` for the original interactive assistant, or `?ending=2` to preview the ending. Reload `/` to replay the full sequence. Intro and ending assets were adapted from `qwen-sec-intro-concepts`; there are no attachment requests.
