# Gemma Demos

Local multimodal demos for testing fast vision-capable model workflows with Gemma, Cerebras, Gemini, and OpenRouter.

## Demos

- `visual-search-triage`: side-by-side image search benchmark. Select a folder of images, describe what to find, and watch two image search agents process the same batches with live API traces, timers, winner highlighting, and image thumbnails in the results.
- `car-damage`: rental-car walkaround inspection demo. Upload a vehicle video, sample frames, send them to Cerebras Gemma vision, and generate a structured damage report with evidence frames.

## Shared Environment

The demos can read API keys from this folder's `.env` file. Do not commit it.

```bash
CEREBRAS_API_KEY=...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
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

Generated folders such as `node_modules`, `dist`, `work`, `outputs`, `datasets`, and `downloads` are intentionally ignored.
