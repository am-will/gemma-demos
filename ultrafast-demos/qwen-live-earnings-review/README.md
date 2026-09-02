# Qwen Live Earnings Review

Multimodal, sequential review of Snowflake's Q2 FY26 earnings package using a local OpenAI-compatible Qwen endpoint. The demo reads a 35-page investor presentation and a 19-page corrected earnings-call transcript, inspects selected chart pages as images, researches official filings, and revises its earnings-quality conclusion after an analyst challenge.

```bash
QWEN_BASE_URL=http://127.0.0.1:18000/v1 \
QWEN_API_KEY=empty \
QWEN_MODEL=Qwen3.8-27B \
npm run dev:qwen-earnings
```

Optional local source overrides:

```bash
EARNINGS_DECK_PDF=/absolute/path/to/deck.pdf
EARNINGS_TRANSCRIPT_PDF=/absolute/path/to/transcript.pdf
```

The source PDFs are fetched from Snowflake investor relations at runtime and cached only in memory. They are not committed to the repository.
