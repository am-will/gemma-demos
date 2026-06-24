# Image Search

Side-by-side multimodal demo for image search across a folder of images.

The browser selects a folder, uploads all image files to the local server, and starts two agents at the same time:

- Gemini Responses API or OpenRouter API, selectable from the left agent card
- Cerebras API, configured for Gemma vision

The UI streams API-call previews, batching events, response timing, match summaries, and image thumbnails so the result quality is visible while the speed comparison is running.

## Setup

```bash
npm install
```

Create `visual-search-triage/.env` or use the existing parent repo `.env` at `../.env`. The server loads both paths, so the base `gemma-demos/.env` works for local testing:

```bash
CEREBRAS_API_KEY=...
CEREBRAS_MODEL=gemma-4-31b-trial

GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash

OPENROUTER_API_KEY=...
OPENROUTER_MODEL=google/gemma-4-31b-it:free
```

Optional batching controls:

```bash
PORT=8791
MAX_BATCH_IMAGES=5
MAX_BATCH_BYTES=3145728
IMAGE_MAX_EDGE=512
IMAGE_JPEG_QUALITY=64
```

## Run

```bash
npm run dev
```

Open `http://127.0.0.1:5176/`.

## Demo Flow

1. Choose a folder full of images.
2. Type a target description, for example `red car with visible body damage`.
3. Click `Start both agents`.
4. Narrate the two terminal panes: both agents receive the same normalized image batches, build comparable API calls, and return all matches with thumbnails.
5. Call out the winner glow and timer treatment when the first agent completes.

## Notes

- All selected images are processed. The server batches requests by image count and estimated JSON payload size.
- API keys stay server-side. Curl previews intentionally show placeholder env names, not secrets.
- The left-side provider can switch between direct Gemini and OpenRouter without changing the Cerebras comparison panel.
- Match descriptions are capped for side-by-side readability.
- Completed runs write a redacted manifest to `outputs/runs/<runId>/manifest.json`.
