# Cerebras Demos

<img width="1644" height="1523" alt="CleanShot 2026-06-24 at 16 56 54" src="https://github.com/user-attachments/assets/305e6c2e-aebb-4d0a-a6db-faf501da29c8" />


Local demos for showing how fast inference changes multimodal and frontier-model workflows.

## Demos

- `visual-search-triage`: side-by-side image search benchmark. Select a folder of images, describe what to find, and watch two image search agents process the same batches with live API traces, timers, winner highlighting, and image thumbnails in the results.
- `car-damage`: rental-car walkaround inspection demo. Upload a vehicle video, sample frames, send them to Cerebras Gemma vision, and generate a structured damage report with evidence frames.
- `llm-output-simulator`: side-by-side token streaming simulator. Set two local streams independently from 0 to 3,000 tok/s and watch a public-domain adventure excerpt reveal at each speed.
- `ultrafast-demos/live-earnings`: GPT-5.6 Sol side-by-side earnings intelligence. A live disclosure changes the supported investment thesis and analyst question.
- `ultrafast-demos/portfolio-shock`: GPT-5.6 Sol side-by-side portfolio analysis. A 90-day counterfactual reveals a second-order supplier dependency and reranks risk.
- `ultrafast-demos/living-incident`: GPT-5.6 Sol side-by-side incident intelligence. New trace evidence replaces a false gateway hypothesis with a verified internal retry storm.

## Shared Environment

The demos can read API keys from this folder's `.env` file. Do not commit it.

```bash
CEREBRAS_API_KEY=...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
OPENAI_API_KEY=... # optional; enables Live API mode in the GPT-5.6 Sol demos
```

Demo-specific `.env` files may also be used when a demo needs local overrides.

## Run

```bash
cd visual-search-triage
npm install
npm run dev
```

```bash
cd car-damage
npm install
npm run dev
```

```bash
cd llm-output-simulator
npm install
npm run dev
```

```bash
cd ultrafast-demos
npm install
npm run dev:incident
```

Generated folders such as `node_modules`, `dist`, `work`, `outputs`, `datasets`, and `downloads` are intentionally ignored.
