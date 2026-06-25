# Damage Scout

<img width="1274" height="1392" alt="CleanShot 2026-06-24 at 17 25 55" src="https://github.com/user-attachments/assets/ed8df815-674f-428f-aded-1a28cefd06a6" />


Hackathon demo app for rental-car walkaround inspections with Cerebras Gemma 4.

The browser uploads a video and shows a local first-frame preview in the picker. The Node server samples frames with `ffmpeg`, sends each selected frame to the Cerebras `gemma-4-31b-trial` vision endpoint, asks for structured JSON damage detections, deduplicates repeat sightings, draws boxes on selected evidence frames, and writes a job manifest under `outputs/jobs/<jobId>/`.

## Setup

```bash
npm install
cp .env.example .env
```

Put your key in `.env`:

```bash
CEREBRAS_API_KEY=...
CEREBRAS_MODEL=gemma-4-31b-trial
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
- `outputs/jobs/<jobId>/damage-report.json`
- `outputs/jobs/<jobId>/damage-report.md`
- `outputs/jobs/<jobId>/damage-*.jpg`

The manifest includes all raw frame-level Gemma findings, the structured damage report, and the deduped evidence frames shown in the UI.

## Performance

The server processes sampled frames with bounded parallelism. The UI exposes:

- `Frame workers`: how many sampled frames can be inspected by Gemma at the same time.
- `Tile workers`: how many panel crops can be inspected at the same time when the secondary tile pass runs for a frame.

Defaults are conservative: `4` frame workers and `3` tile workers. Increase them carefully if the Cerebras account has enough rate-limit headroom; lower them if requests start failing with rate-limit errors.

## Notes

- The app does not perform damage detection locally. Local code only extracts frames, calls Cerebras, deduplicates results, and draws the model-provided boxes.
- Keep `sample fps` and coverage frames bounded during hackathon demos. Good starting point: `0.5 fps`, `20 coverage frames`, `0.35 confidence floor`, `4 frame workers`, `3 tile workers`.
- Frame extraction defaults to `FRAME_EXTRACTION_MODE=sparse-sharp`, which seeks near target timestamps, scores blur with a sharpness metric, and retries nearby offsets only when a frame is too soft. Set `FRAME_EXTRACTION_MODE=single-pass` to use the slower full scan baseline.
- Image quality is intentionally kept high for subtle damage detection: default frame width is `1920px` and FFmpeg JPEG quality is `2`. Lower these only when speed matters more than scratch/dent recall.
- The dedupe logic is intentionally simple: it favors high-confidence findings and suppresses nearby repeated detections with overlapping labels, locations, or bounding boxes.
- Agent-specific maintenance instructions live in `AGENTS.md`.
