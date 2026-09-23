# From prompt to play — transcript replay

A cream/light-mode Cerebras browser presentation driven by the saved OpenCode
session, with syntax-highlighted commands, source, diffs, and results. The MP4s
are timing references; the interface does not play a terminal video or execute
the commands it displays.

## Run

```sh
npm install
npm run export:replay
npm run dev
```

Open http://127.0.0.1:5197/. Export is needed only if the local generated replay
is missing or its transformation changes. It reads the OpenCode SQLite database
in read-only mode. The original session and recordings are unchanged.

`npm run build` validates the timeline, checks game TypeScript, and builds the
presentation. `npm run preview` serves the production build on port 4197.

## Presentation

1. The compact prompt composer reserves the final text height before typing,
   shows the Qwen logo, and uses a pointing hand to click Send.
2. The session replays in a cream terminal at 1× retained source timing. Tool
   cards show syntax-highlighted contents; the latest tool expands automatically,
   except bookkeeping plans, which remain compact to avoid opening scroll jumps.
3. Completion shows “Worked for 1m50s” and a centered DONE card for four seconds.
   “Run the game” is then typed and submitted with another animated hand click.
4. After the 6.124-second launch response, the actual local game opens. An input
   driver plays level one using normal movement and collision rules. Level one
   has three homes. The camera slowly orbits and tilts; clouds are kept clear of
   the board-to-camera corridor. Manual movement or dragging takes over control.
5. Winning holds for four seconds while the camera returns to its opening angle,
   then starts the original Cerebras/Qwen bumpers. **P** also starts the bumpers.
   **I** skips to the build's DONE card from the page or embedded game.

R restarts when the outer page has focus and a text field is not focused. Space
pauses/resumes the build replay. The composer also shows a Stop button while
the replay runs; stopping freezes the output and timer and switches it to Resume.
Neither keyboard shortcut is advertised in the UI.
Standalone game P retains its original pause function; embedded P belongs to the
presentation. Embedded gameplay starts muted; M toggles sound.

## Timing and editorial choices

Source session: `ses_f39eeb256ffeBWp3Qhq1yAHkfO`, September 21, 2026,
Cerebras / Qwen 3.8 27B. Only the initial implementation is replayed, from the
scaffold turn at 22:25:36.740 UTC through completion at 22:30:51.222 UTC
(about 5:07 in the first recording). Later improvement runs are excluded.

The build contains **68 tool calls / 107 visible events** and lasts
**110.722 seconds (1:50.7)**. The original selected span was 314.482 seconds;
203.760 seconds of compaction, follow-up gaps, permission waits, long thinking,
and static command waits are removed. The timer is labeled **Time**;
this is an edited presentation, not a fresh inference or total-build benchmark.

Timing was reviewed against the first recording at 10 samples per second.
Transcript-region frame differences excluded the animated spinner, caret, and
sidebar; candidate static intervals were checked visually. The explicit
0:28–0:53 stall and the external-directory permission wait around 2:35–2:55
are cut. Other static intervals are listed in `STATIC_CUTS` in the exporter.
Remaining gaps longer than three seconds without a new text block, tool payload,
or result retain a one-second beat. Retained intervals play at 1×. Static screens
alone cannot establish whether a wait was caused by a server error.

Text, commands, file contents, and edits appear as whole blocks. Read results
appear on completion; command outputs appear when the recorded command finishes.
There is no character-by-character interpolation or assumed token rate. Saved
text-part end timestamps can include generation of subsequent tool arguments,
so they must not be used as text-stream durations. The source provides block
arrival times, not exact per-token arrival timestamps.

The automatic launch replays the original **run it** response (two commands and
the final response, 6.124 seconds) before the game opens. The build timer stays
frozen. The original recordings and SQLite database are unchanged.

The opening prompt is corrected, project naming is normalized to Voxel Crossing,
continuation preambles and stale launch instructions are removed, and local
paths/credential-shaped strings are sanitized. Operational text and code are
otherwise sourced from the saved records. Truncated outputs are labeled as
excerpts.

`public/replay/session.json` includes a source-to-replay interval map and
transformation metadata. It is generated locally and ignored by Git. The export
uses an explicit field allowlist and does not copy the database or credentials.
The game is the prepared local source copy used by this demo, including existing
presentation polish; this replay is not a file-by-file historical reconstruction
of that final source tree.

`src/config.js` owns the prompt and bumper timings. The model-stage benchmark
line is inherited bumper copy, not a speed measurement made by this replay.

## Direct preview routes

- `?scene=build&at=60` — replay at one minute.
- `?scene=done` — four-second completion card.
- `?scene=ready` — automatic launch typing and click.
- `?scene=showcase` — interactive game.
- `?scene=ending` — bumper.

These are authoring conveniences. The normal route runs prompt → replay → automatic
launch → automatic first-level gameplay → victory hold → bumper.
