# AGENTS.md

## Scope

These instructions apply to the `gemma-demos` workspace. Demo-specific `AGENTS.md` files inside child folders override these notes for that demo.

## Operating Rules

- Act directly on requested implementation work. Ask only when an action is destructive, irreversible, or would expose secrets.
- Never commit `.env`, API keys, uploaded media, generated reports, downloaded datasets, `node_modules`, or build output.
- Prefer existing demo patterns over new framework choices. These demos are Vite + React clients with Node/Express servers.
- Keep provider credentials server-side. UI traces may show redacted placeholders such as `$CEREBRAS_API_KEY`, not real key values.
- Use `rg` for search and `npm run build` as the minimum verification after UI/server changes.

## Demo Map

- `visual-search-triage`: Image Search demo, local dev URL `http://127.0.0.1:5176/`, API server `http://127.0.0.1:8791`.
- `car-damage`: Damage Scout demo, local dev URL `http://127.0.0.1:5173/`, API server `http://127.0.0.1:8787`.
