# Inference Speed Simulator

Two locally simulated inference streams make decode throughput visible. Each slider controls one side from 0 to 3,000 tokens per second; the live readout shows the measured rate currently being displayed.

Use the mode toggle to compare either:

- A coding-agent harness with streamed reasoning summaries, syntax-highlighted code, and periodic compact tool activity that pauses for about 0.7 seconds.
- A continuous book stream using the same decode controls.

The output loops a short excerpt from L. Frank Baum's *The Wonderful Wizard of Oz* (1900), a public-domain source, so the demo can run continuously without an API key or network request.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5178/`.
