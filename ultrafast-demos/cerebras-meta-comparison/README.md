# Cerebras / Meta AI API comparison

White demo panels on a Cerebras-orange background with white corner dots; side-by-side edit with the Qwen-style closing bumper. 1920×1080, 61 seconds, 30fps, silent.

- The demo is fully visible from the first frame, with no opening fade.
- Both prompt sections fit the same **5.5-second window**, from 1.5–7s. Cameras zoom in together, then zoom out from 7–7.9s. Both submit at **8.5s**.
- Both responses run at **1×** until Cerebras completes at 28.067s. Meta then runs at **6×**, with the pulsing Meta-blue (`#0081FB`) badge, until 41.678s. The badge clears and Meta returns to 1× for 200ms before DONE appears at 41.878s. Timers follow original recording time, including during the speedup.
- The speed-first DONE cards show **1,336 tokens/sec / 19.5 sec** for Cerebras and **53.2 tokens/sec / 101.4 sec** for Meta. Times are floored to a tenth. The compact 400×326px cards persist until the bumper; Cerebras also gets confetti.
- The comparison holds through **50s**, then the 11-second Qwen Ending 2 sequence counts up to **“Up to 25× faster than GPUs”** and reveals the Cerebras / Meta AI horizontal logos. The multiplier is the rounded throughput ratio, 1,336 / 53.2 ≈ 25.11, separate from task time.

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
