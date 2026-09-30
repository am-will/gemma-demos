# Cerebras / Meta AI API comparison

White demo panels on a Cerebras-orange background with white corner dots; side-by-side edit with the Qwen-style closing bumper. 1920×1080, 58.5 seconds, 30fps, silent.

- Opens directly on a large native Muse prompt box over the orange / white-dot background, with no white fade.
- The full-height Muse prompt box is visible from frame zero. The shared prompt types from **1.5–6.7s**, then the selected **Send & Reveal** animation launches it upward and raises both panels together. Both settle by **9.68s** and submit at **10.0s**.
- Responses use **one paired video track at 30fps**, preventing independent video players from drifting. The first submitted screens align using prepared frame 256 for Cerebras and 255 for Meta (one idle Cerebras frame removed). Reported elapsed values remain the original click-to-completion measurements.
- Both responses run at **1×** until Cerebras completes at 29.567s. Meta then runs at **6×**, with the pulsing Meta-blue (`#0081FB`) badge, until 43.178s. The badge clears and Meta returns to 1× for 200ms before DONE appears at 43.378s. Timers follow original recording time, including during the speedup.
- The speed-first DONE cards show **1,336 tokens/sec / 19.5 sec** for Cerebras and **53.2 tokens/sec / 101.4 sec** for Meta. Times are floored to a tenth. The compact 400×326px cards persist until the bumper; Cerebras also gets confetti.
- The comparison holds through **47.5s**, then the 11-second Qwen Ending 2 sequence counts up to **“Up to 25× faster than GPUs”** and reveals the Cerebras / Meta AI horizontal logos. The multiplier is the rounded throughput ratio, 1,336 / 53.2 ≈ 25.11, separate from task time.

## Sources and timing

- Cerebras: `CleanShot 2026-09-24 at 9.38.33 PM.mp4`; submit 28.066667s, complete 47.633333s.
- Meta: `CleanShot 2026-09-24 at 10.19.11 PM.mp4`; submit 27.266667s, complete 128.7s, end 135.346667s. Its final UI reports **53.2 tok/s**. The rounded viewport mask matches the new 900×958 source dimensions.

Markers are measured to approximately one 30fps frame; see `timing.json`. The timers include app/tool overhead. `python3 prepare-media.py` regenerates local media without altering the originals. Response portions in the prepared assets remain at 1×; the composition applies the later 6× playback.

## Run

```sh
npm run dev
npx hyperframes@0.8.59 play --port 5198
npm run build
npm run render -- --fps 30 --quality delivery --output renders/cerebras-meta-comparison-final-v4.mp4
```

Manrope is the main font; all-caps Sometype Mono is the accent font. Fonts, GSAP and logos are bundled locally. Media, renders, reports, and generated snapshots are ignored by git.

Meta AI orbit icon: https://meta.ai/images/meta-ai-orbit-logo-gradient-3d_light.svg
Meta AI horizontal wordmark: https://github.com/lobehub/lobe-icons/blob/master/packages/static-svg/icons/metaai-text.svg
Cerebras wordmark and bumper style: the existing Qwen Ending 2 project.

The 25× performance screen includes a centered gray methodology note: “Both demos used the same custom harness and prompt, interacting with functional websites.”

Rollback checkpoint before the shared-prompt intro: `379a340`. Source video files stay local and are not committed.

Previous native Muse split-and-drop animation is retained as a rollback baseline (saved as `snapshots/approved-native-prompt.html`). Four alternative transitions are review-only renders under `renders/transition-options/`; keep the main intro until a replacement is selected.

Selected transition: **Send & Reveal**. `prepare-paired-playback.py` creates the shared response track; `prepare-media.py` invokes it after regenerating both prepared recordings.

Intro polish: hold the completed prompt an additional **1.5s**. Press Send at 8.25s, then shrink, tilt backward 33 degrees, and fade the prompt during its departure. Both panels and the full comparison timeline move 1.5s later together; the recorded response track is unchanged.

The 33-degree tilt, shrink, fade, and upward flight now happen simultaneously in one 900ms motion.

Trimmed four seconds from the middle of the completed comparison hold (original timeline 45–49s). The DONE animations stay intact; the bumper begins at 47.5s and the video ends at 58.5s.
