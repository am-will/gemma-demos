# Muse desktop (OpenClaw / VulcanClaw fork)

This is the custom Muse-style Electron app used for the Fandango, DoorDash and Walmart demos. It is not Meta's official Muse application.

**[Download the complete source ZIP](https://github.com/am-will/gemma-demos/releases/download/muse-desktop-2026-09-30/muse-desktop-d68c230-source.zip)**

The source is hosted as a release asset **in this repository**. It does not require access to Shane's repository. The 179 MB snapshot avoids adding approximately 45,000 upstream files to every Gemma Demos checkout. Extract it into its own folder; `apps/electron` contains the desktop shell and `ui` contains the interface. Source revision: `d68c2303a22bd7ea85f6c3046b7a94298390d884` from the VulcanClaw fork. Upstream license files are included.

## Windows handoff

This is source, not a Windows installer. The app was verified on macOS; native Windows execution has not been tested. Use Node 24.16 or later in the 24.x line and pnpm 12.4.0. An account entitled to `msl-muse-spark-1.2` is required. No API keys, chat history, browser cookies or saved payment data are included.

In PowerShell, from the extracted source folder:

```powershell
npm install -g pnpm@12.4.0
pnpm install --frozen-lockfile
pnpm build
pnpm ui:build
npm install --prefix apps/electron --workspaces=false
node portable/setup.mjs
$env:CEREBRAS_API_KEY = Read-Host 'Cerebras API key' -MaskInput
$env:OPENCLAW_CONFIG_PATH = Join-Path $PWD '.artifacts/local-demo/openclaw.json'
$env:OPENCLAW_STATE_DIR = Join-Path $PWD '.artifacts/local-demo/state'
node scripts/run-node.mjs gateway run --port 18791 --bind loopback
```

`-MaskInput` requires PowerShell 7.2+. Keep this terminal running. Set the same `OPENCLAW_CONFIG_PATH` and `OPENCLAW_STATE_DIR` in a second terminal, then start the relay and desktop:

```powershell
node scripts/run-node.mjs browser --browser-profile embedded status
npm --prefix apps/electron start
```

Run each website server in an additional terminal from the extracted root:

```powershell
node scripts/serve-movie-demo.mjs
node scripts/serve-doordash-demo.mjs
node scripts/serve-walmart-demo.mjs
```

They use ports 18830, 18831 and 18833 respectively. Run these as separate commands in separate terminals, since each remains running. Gateway and desktop must share the same config/state paths. See `apps/electron/README.md` in the ZIP for browser relay diagnostics. If native dependencies fail on Windows, use a Windows-capable coding agent to resolve those platform issues; a Linux/WSL Electron window is not automatically a native Windows app.

The portable setup creates a new random gateway token and restores the workflow instructions without copying the Mac's credentials or session state. The default provider is Cerebras. The previous experimental +120 TPS display offset is **not enabled by these build commands**.

## Prompts

- Fandango: Find me four tickets to Spider-Man: Brand New Day at the closest theater to 94118 on opening night after 4 PM. Make sure all four seats are together.
- DoorDash: Hey Muse! Order me a cinnamon roll and a small hot latte with almond milk from Flour Bakery.
- Walmart: Choose an excellent gift at Walmart for a curious three-year-old and add it to my cart. Strong preference to a wooden educational toy.

These shopping pages are isolated demonstrations and do not place real orders.
