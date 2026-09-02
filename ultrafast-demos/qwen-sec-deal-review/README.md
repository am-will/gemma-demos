# SEC Visual Deal Review

This is the longer Qwen3.8-27B multimodal SEC workflow. It reads an 81-page transaction presentation, inspects five valuation charts, researches three contemporaneous primary sources online, produces a cited deal brief, then answers an analyst challenge and revises the conclusion.

The example is Broadwood Partners' SEC-filed presentation opposing the proposed $28-per-share acquisition of STAAR Surgical by Alcon. The PDF is loaded from the official SEC source at runtime and is not committed to the repository.

## Run with the local Qwen server

If the Linux API is reachable directly:

```bash
QWEN_BASE_URL=http://192.168.1.132:8000/v1 npm run dev:qwen-deal
```

If Mac-to-Linux port 8000 is blocked, use the SSH tunnel:

```bash
ssh -N -L 18000:127.0.0.1:8000 linux
QWEN_BASE_URL=http://127.0.0.1:18000/v1 npm run dev:qwen-deal
```

For a repeatable demo without a network download, point the server to a local copy of the official PDF:

```bash
DEAL_REVIEW_PDF=/absolute/path/to/ea0259891-dfan14a_broadwood.pdf QWEN_BASE_URL=http://127.0.0.1:18000/v1 npm run dev:qwen-deal
```

Open `http://127.0.0.1:5189/`.

Optional server-side environment variables:

- `QWEN_API_KEY` defaults to `empty`
- `QWEN_MODEL` defaults to `Qwen3.8-27B`
- `DEAL_REVIEW_PDF` points to a local PDF cache

The browser never receives the API key. The Vite server extracts native text with Poppler, renders the relevant pages, and sends five real `input_image` items with `detail: "high"` across ten dependent `/responses` calls. The research stages fetch the definitive proxy, STAAR's response, and the official transaction announcement before synthesis.
