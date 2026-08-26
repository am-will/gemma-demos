# Cerebras Ultrafast enterprise demos

Six side-by-side GPT-5.6 Sol demos built around the same interaction: a live
event starts an investigation, a useful artifact appears, and new evidence
forces the conclusion to change.

The original demos remain intact:

- `live-earnings` — a live earnings call changes the investment thesis.
- `portfolio-shock` — a 90-day supplier outage changes the exposure ranking.
- `living-incident` — trace evidence corrects the root-cause hypothesis.

The quant-focused additions are:

- `earnings-shock-desk` — compare results with Street, whisper, and desk
  expectations; normalize a live timing disclosure; publish a revised decision card.
- `fomc-minutes-shock-map` — diff new minutes against the policy baseline, test
  the inference against an analyst objection, and map the revised rates scenario.
- `sec-material-event-radar` — triage a simultaneous 8-K and 6-K batch, read
  exhibits, rank material events, and reject a filing-level false positive.

## Run

From this folder:

```bash
npm install
npm run dev:incident
```

The other launch commands are `dev:earnings`, `dev:portfolio`,
`dev:earnings-shock`, `dev:fomc`, and `dev:sec-radar`. The apps use ports
5181–5187.

Each demo defaults to a clearly labeled scripted replay for reliable recording.
To use real requests, add `OPENAI_API_KEY` to the repository root `.env`, start
the demo, and choose **Live API**. Both lanes send the same prompt and structured
output requirements to `gpt-5.6-sol`; Standard requests use the default service
tier and Ultrafast requests use the fast service tier. Availability depends on
the API project having Ultrafast preview access.

Replay times and filing throughput are illustrative and are never presented as measured results.
Live mode displays the request's measured wall-clock time and the service tier
reported by the API.

## Source basis

- [OpenAI, “Previewing Ultrafast mode: GPT-5.6 Sol at up to 14X the speed”](https://openai.com/index/previewing-ultrafast/),
  August 13, 2026. The up-to-750-output-token/s and up-to-14x figures are vendor
  claims, not measurements from these demos. OpenAI also describes incident
  response, financial research, and live research as early Ultrafast workflows.
- [OpenAI Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create)
  documents Standard (`default`) and Fast (`fast`) request-level service tiers.
- [FactSet AI Solutions](https://www.factset.com/ai-solutions) publicly documents
  transcript analysis, portfolio analysis, source linking, internal research,
  and two-way financial research workflows.

All companies, portfolio positions, financials, events, logs, and conclusions
inside the demos are synthetic.
