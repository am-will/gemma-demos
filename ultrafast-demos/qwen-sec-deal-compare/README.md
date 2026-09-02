# Qwen SEC Deal Compare

Side-by-side variant of the multimodal SEC transaction review. It shows one shared 81-page filing scanner while two independent 10-pass reviews run concurrently.

The lanes run the same Qwen 3.8 27B multimodal workflow through OpenRouter and Cerebras. Provider credentials stay in the repository-level `.env` and are never sent to the browser. No artificial delays are used.

```bash
cd ultrafast-demos
CEREBRAS_API_KEY=... \
OPENROUTER_API_KEY=... \
DEAL_REVIEW_PDF=/absolute/path/to/transaction-filing.pdf \
npm run dev:qwen-deal-compare
```

`CEREBRAS_MODEL` and `OPENROUTER_MODEL` may override the default model IDs. Rendered PDF pages are sent to both providers.
