# AGENTS.md

## Demo Purpose

`visual-search-triage` is the Image Search side-by-side demo. It compares two image search agents on the same selected image folder and streams their trace events, timers, API-call previews, and matching image thumbnails.

## Commands

```bash
npm install
npm run dev
npm run build
```

Local URLs:

- Client: `http://127.0.0.1:5176/`
- API: `http://127.0.0.1:8791`

## Environment

The server loads `.env` in this folder and `../.env` in the base `gemma-demos` folder.

Required for the full demo:

```bash
CEREBRAS_API_KEY=...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
```

Common optional overrides:

```bash
CEREBRAS_MODEL=gemma-4-31b-trial
GEMINI_MODEL=gemini-3.5-flash
OPENROUTER_MODEL=google/gemma-4-31b-it:free
PORT=8791
MAX_BATCH_IMAGES=4
MAX_BATCH_BYTES=3145728
IMAGE_MAX_EDGE=512
IMAGE_JPEG_QUALITY=64
```

## Implementation Notes

- Process all selected images. Batch by image count and payload size where possible.
- Keep the two visible panels framed as agents, with live trace output and comparable result rows.
- Result descriptions should stay short enough for side-by-side comparison, and each returned match should include a visible thumbnail when the local preview URL is available.
- Do not add PDF ingestion; this demo is image + text only.
- Do not commit local COCO downloads, selected folders, uploaded images, run manifests, or generated output.
