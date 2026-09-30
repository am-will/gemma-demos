# Qwen comparison theme
Reuse the existing qwen-sec-chat-review styling: warm white #f2f1ed, white panels, orange #f15a29, charcoal #252525. Cerebras icon from car-damage/public/assets/cerebras-logo.png. Headers are equal and timers live at each upper-right corner. Completion cards use the existing peach #ffe3d9, rounded 24px corners, soft shadow, Done headline and pill with one-decimal seconds; Meta is neutral gray. The card expands from the header timer in 820ms and settles, then remains until the final frame on both sides. No new title, slogans, intro, bumper, or music. Exact Qwen typography: Manrope for main brand labels; uppercase Sometype Mono for DONE, timers (SEC), and the 6× accent badge. Footage is the focal element and fills the two equal panels; nothing overlays the prompt during typing.

Reuse shared/circular-dot-field.css for the orange dotted corner background behind the opaque white lanes. Preserve the 9px dot spacing and soft radial falloff.

Added the Qwen Ending 2 sequence at 47s: Muse Spark 1.2 headline, animated count-up to “Up to 23× faster than GPUs”, Cerebras partner reveal, then the Cerebras / Meta AI horizontal logo reveal from a divider. Total duration 58s. The figure uses the requested rounded throughput inputs, 1,330 / 58. DONE card option 3 selected: speed-first hierarchy, tightened 400px width and 326px height.

Selected DONE option 3 with reduced horizontal space: centered 400×326px card, 32px DONE, 90px tokens-per-second value, 17px accent label, and 25px elapsed-time pill. Cerebras 1,336 TOKENS PER SECOND; Meta 58.7 TOKENS PER SECOND. Both persist until the bumper.

Latest source replacement: use CleanShot 2026-09-24 at 10.19.11 PM.mp4 for Meta (900×958). Submission 27.266667s; completion 128.7s; recorded elapsed 101.433333s; throughput 53.2 tok/s. Retain synchronized 5.5s typing and 8.5s submission. Meta acceleration remains 6× after Cerebras finishes. Meta finishes at composition 41.711s; comparison ends at 50s; bumper 50–61s. Update speed-first card to 53.2 / 101.4 SEC and bumper to 25× (1,336 / 53.2 rounded).

For the latest Meta source, match its measured #fdfdfd white and crop 3px from each footage edge inside the rounded mask to hide the recording’s 1px black outer edge.

Remove the TPS-math footer from the final brand screen. Keep the 25× headline and logo reveal.

Transition polish: end Meta 6× playback and clear its badge 200ms before its DONE entrance. Play the final 200ms of the task at 1×, keeping the timer tied to source elapsed time. Fast playback ends at 41.678s; DONE begins at 41.878s. Preserve the 50s bumper start and 61s total runtime.

Shared-prompt intro revision: the enlarged recorded crop is replaced by native HTML text and SVG controls adapted from the Muse/OpenClaw fork at `../vulcanclaw/ui/src/styles/app-sidebar.css`, `chat/composer-surface.css`, `base.css`, and `components/icons{,-tools}.ts`. Bundle its Instrument Sans Latin variable font locally. Composer layout is 2.5x native size, with a 40px editor, 75px radius, original plus/mic/send paths, and #e3f0ff send circle. No opening white fade, 3D tilt, or magnified video text. Type 1.5–6.7s, hold, split at 7s, then drop and dissolve into both agents by 8.28s. Keep the 8.5s submission and subsequent timings unchanged.

Final selected intro: Send & Reveal. Keep the composer at 320px total height from frame zero (270px editor + 50px padding), top 270px. Finish typing at 6.7s, press Send, launch the prompt upward, and raise both panels simultaneously from 7.56–8.44s. At 8.5s a single precomposed paired video starts both submitted frames on one playback clock. Preserve real UI startup delays; do not trim backend latency. The prior split-and-drop is archived, not active.

Latest motion polish: add 1.1s reading time; Send press at 7.85s, departure 8.1–9.0s. Use 1600px perspective with 46deg backward rotationX while shrinking and fading out. Panels enter together at 8.66s and settle at 9.54s. Shared response begins at 9.6s, bumper at 51.1s, total 62.1s.

Stronger tilt revision: 900px perspective and 78deg rotationX, beginning at 8.1s with power2.out over 420ms so the tilt reads while the prompt is still large. Delay the fade until 8.45s; preserve the hold and all downstream timing.

User-selected tilt: 33deg backward rotationX. Keep the earlier 8.1s start, 420ms easing, 900px perspective, and delayed fade.

Unified departure: rotationX 33deg, scale 0.4, y -670px, and opacity 0 animate together in one 900ms power2.inOut tween at 8.1s. No preliminary tilt or downward anticipation. Keep the extra reading hold and synchronized agent start unchanged.

Final reading hold: add another 400ms (1.5s extra total). Send at 8.25s; unified departure 8.5–9.4s; panels enter 9.06s and settle 9.94s. Shared responses begin 10.0s, bumper 51.5s, total 62.5s.

Centered opening: the fixed 1680×320px composer sits at x=120, y=380 on the 1920×1080 canvas, centered on both axes throughout typing.

Shorter DONE hold: cut original timeline 45–49s from the shared footage after both completion animations. Bumper starts at 47.5s; final duration 58.5s.

Panel entrance: both lanes start at 50% scale with their top edges at the bottom of the canvas. Rise and uniform growth share one 880ms power2.inOut tween (9.06–9.94s), reaching full width exactly at the final top position. Top-center transform origins keep each panel centered on its own half.

Timing correction: preserve the original expo.out entrance at 9.06s for 880ms. With the new top-center origin, y=1150.96 reproduces the previous top-edge path (1120 + 1032 × 0.03). Scale grows from 0.5 to 1 on that original fast rise; no delayed ease-in.

Closer transition overlap: panels begin at 8.80s, 260ms earlier and only 300ms after prompt departure starts. Keep the original expo.out movement and half-size growth; panels settle at 9.68s. Response playback remains synchronized at 10.0s.
