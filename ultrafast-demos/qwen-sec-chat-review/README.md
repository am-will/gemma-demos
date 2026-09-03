# Qwen 3.8 27B SEC Chat Review

A standalone chat-style version of the SEC filing review. It moves through a typed prompt, a fast 81-page document flip, and a live ten-step Qwen 3.8 27B conversation without exposing provider traces.

```bash
npm run dev
```

Open `http://127.0.0.1:5193/`. Add `?intro=0` to begin at the document flip.
