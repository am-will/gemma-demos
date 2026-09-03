# Qwen 3.8 27B Direct SEC Chat Review

A standalone variant of the SEC filing review that moves directly from the typed prompt into the side-by-side Qwen conversation. The document-flip scene is intentionally omitted, and the live review begins 500ms after the prompt transition finishes.

```bash
npm run dev
```

Open `http://127.0.0.1:5194/`. Add `?intro=0` to begin directly in the chat.
