# Damage Scout

<img width="1274" height="1392" alt="CleanShot 2026-06-24 at 17 25 55" src="https://github.com/user-attachments/assets/ed8df815-674f-428f-aded-1a28cefd06a6" />


Hackathon demo app for rental-car walkaround inspections with side-by-side Gemma 4 agents.

The browser uploads a video and shows a local first-frame preview in the picker. The Node server samples frames with `ffmpeg` immediately after upload, then the Run button sends the extracted frames to both the GPU lane and Cerebras lane. Each agent asks for structured JSON damage detections, deduplicates repeat sightings, draws boxes on selected evidence frames, and writes a job manifest under `outputs/jobs/<jobId>/`.

## Setup

```bash
npm install
cp .env.example .env
```

Put your key in `.env`:

```bash
CEREBRAS_API_KEY=...
CEREBRAS_MODEL=gemma-4-31b
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=google/gemma-4-31b-it
PORT=8787
```

`ffmpeg` must be installed and available on `PATH`.

## Run

```bash
npm run dev
```

Open `http://127.0.0.1:5173/`.

For a production-style run:

```bash
npm run build
npm start
```

Open `http://127.0.0.1:8787/`.

## Output

Each completed job writes:

- `outputs/jobs/<jobId>/manifest.json`
- `outputs/jobs/<jobId>/gpu/damage-report.json`
- `outputs/jobs/<jobId>/gpu/damage-report.md`
- `outputs/jobs/<jobId>/gpu/damage-*.jpg`
- `outputs/jobs/<jobId>/cerebras/damage-report.json`
- `outputs/jobs/<jobId>/cerebras/damage-report.md`
- `outputs/jobs/<jobId>/cerebras/damage-*.jpg`

The manifest includes both agents' raw frame-level Gemma findings, structured damage reports, and deduped evidence frames shown in the UI. The demo UI and trace output label the OpenRouter-backed lane as `GPU` and redact provider-specific endpoint/key details.

## Performance

The server processes sampled frames with bounded parallelism. The UI exposes:

- `Frame workers`: how many sampled frames each agent can inspect at the same time.
- `Tile workers`: how many panel crops can be inspected at the same time when the secondary tile pass runs for a frame.

Defaults are conservative: `4` frame workers and `3` tile workers. Increase them carefully if both provider accounts have enough rate-limit headroom; lower them if requests start failing with rate-limit errors.

## Notes

- The app does not perform damage detection locally. Local code only extracts frames, calls the configured hosted vision models, deduplicates results, and draws the model-provided boxes.
- Keep videos under 60 seconds for fast iteration. Good starting point: `0.5 fps`, `20 coverage frames`, `0.35 confidence floor`, `4 frame workers`, `3 tile workers`.
- Frame extraction defaults to `FRAME_EXTRACTION_MODE=sparse-sharp`, which seeks near target timestamps, scores blur with a sharpness metric, and retries nearby offsets only when a frame is too soft. Set `FRAME_EXTRACTION_MODE=single-pass` to use the slower full scan baseline.
- Image quality is intentionally kept high for subtle damage detection: default frame width is `1920px`, extraction uses PNG candidates to avoid HDR/posterization artifacts, and final evidence JPEG quality is `92`. Lower these only when speed matters more than scratch/dent recall.
- The dedupe logic is intentionally simple: it favors high-confidence findings and suppresses nearby repeated detections with overlapping labels, locations, or bounding boxes.
- Agent-specific maintenance instructions live in `AGENTS.md`.
