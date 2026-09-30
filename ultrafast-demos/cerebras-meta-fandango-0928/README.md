# September 28 Fandango comparison

Headers include “Meta Muse Spark 1.2, running on Cerebras” on the left and “Meta Muse Spark 1.2, running on Meta Model API” on the right.

Uses the approved Send & Reveal template with the exact new Spider-Man ticket prompt. Sources remain unchanged on the Desktop. Open preview on port 5202.

## Measured source timing

| Provider | Recording | Submit | Complete | Elapsed | Final token rate |
|---|---|---:|---:|---:|---:|
| Cerebras | 11.22.31 AM | 2.166667 s | 17.100000 s | 14.933333 s | 1,402 tok/s |
| Meta AI API | 11.24.26 AM | 1.766667 s | 58.266667 s | 56.500000 s | 62.2 tok/s |

Submission and completion were visually checked at 30 fps. Recorded UI uses whole seconds; comparison counters use floored tenths from the measured frames. Both response tracks begin at timeline 10.0 s on a single paired video clock. Meta accelerates 4× (shown as 4×) once Cerebras finishes and returns to 1× for its last 200 ms. DONE cards remain until the ending begins at 39.6 s, with a 4.1 s hold after Meta completes.

Both 904×948 recordings are cropped to [6, 6, 892, 936], removing six pixels on all edges. Rounded masks remove remaining source corner artifacts. The source app uses the same near-white as the surrounding panels.

The bumper shows the rounded throughput ratio, 23× (1402 / 62.2). Intro prompt uses Instrument Sans Medium (500). Total export: 50.6 seconds, 1920×1080, 30 fps, silent.

Rebuild media and HTML with python3 prepare-variant.py; this preserves the project-specific font weight and rounded badge. Run npm run build before rendering.
