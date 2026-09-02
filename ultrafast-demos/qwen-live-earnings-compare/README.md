# Qwen Live Earnings Compare

Side-by-side variant of the Qwen multimodal earnings-quality review. It keeps the 54-page Snowflake evidence package in one shared scanner while running two independent reasoning streams in parallel.

The lanes run the same Qwen 3.8 27B multimodal workflow through OpenRouter and Cerebras. Provider credentials stay in the repository-level `.env` and are never sent to the browser.

```bash
cd ultrafast-demos
CEREBRAS_API_KEY=... \
OPENROUTER_API_KEY=... \
EARNINGS_DECK_PDF=/absolute/path/to/investor-deck.pdf \
EARNINGS_TRANSCRIPT_PDF=/absolute/path/to/transcript.pdf \
npm run dev:qwen-earnings-compare
```

`CEREBRAS_MODEL` and `OPENROUTER_MODEL` may override the default model IDs. The two lane requests launch concurrently, rendered PDF pages are sent to both providers, and no artificial delays are used.
