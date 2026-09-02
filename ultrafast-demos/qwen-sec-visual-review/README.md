# Qwen SEC Filing Visual Review

Single-model multimodal demo using an OpenAI-compatible `/responses` endpoint.

The server extracts native PDF text, renders every page with Poppler, and sends both the text and page images to Qwen. Provider credentials stay on the Vite server.

## Run against the LAN endpoint

From `ultrafast-demos`:

```bash
QWEN_BASE_URL=http://192.168.1.132:8000/v1 npm run dev:qwen-sec
```

The defaults are:

```text
QWEN_API_KEY=empty
QWEN_MODEL=Qwen3.8-27B
```

## Run through an SSH tunnel

If Linux port 8000 is not reachable directly from the Mac:

```bash
ssh -N -L 18000:127.0.0.1:8000 linux
QWEN_BASE_URL=http://127.0.0.1:18000/v1 npm run dev:qwen-sec
```

Open `http://127.0.0.1:5188/`.

## Local requirements

The PDF pipeline requires `pdfinfo`, `pdftotext`, and `pdftoppm` from Poppler.
