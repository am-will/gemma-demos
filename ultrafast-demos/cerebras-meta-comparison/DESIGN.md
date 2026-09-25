# Qwen comparison theme
Reuse the existing qwen-sec-chat-review styling: warm white #f2f1ed, white panels, orange #f15a29, charcoal #252525. Cerebras icon from car-damage/public/assets/cerebras-logo.png. Headers are equal and timers live at each upper-right corner. Completion cards use the existing peach #ffe3d9, rounded 24px corners, soft shadow, Done headline and pill with one-decimal seconds; Meta is neutral gray. The card expands from the header timer in 820ms and settles, then remains until the final frame on both sides. No new title, slogans, intro, bumper, or music. Exact Qwen typography: Manrope for main brand labels; uppercase Sometype Mono for DONE, timers (SEC), and the 6× accent badge. Footage is the focal element and fills the two equal panels; nothing overlays the prompt during typing.

Reuse shared/circular-dot-field.css for the orange dotted corner background behind the opaque white lanes. Preserve the 9px dot spacing and soft radial falloff.

Added the Qwen Ending 2 sequence at 47s: Muse Spark 1.2 headline, animated count-up to “Up to 23× faster than GPUs”, Cerebras partner reveal, then the Cerebras / Meta AI horizontal logo reveal from a divider. Total duration 58s. The figure uses the requested rounded throughput inputs, 1,330 / 58. DONE card option 3 selected: speed-first hierarchy, tightened 400px width and 326px height.

Selected DONE option 3 with reduced horizontal space: centered 400×326px card, 32px DONE, 90px tokens-per-second value, 17px accent label, and 25px elapsed-time pill. Cerebras 1,336 TOKENS PER SECOND; Meta 58.7 TOKENS PER SECOND. Both persist until the bumper.

Latest source replacement: use CleanShot 2026-09-24 at 10.19.11 PM.mp4 for Meta (900×958). Submission 27.266667s; completion 128.7s; recorded elapsed 101.433333s; throughput 53.2 tok/s. Retain synchronized 5.5s typing and 8.5s submission. Meta acceleration remains 6× after Cerebras finishes. Meta finishes at composition 41.711s; comparison ends at 50s; bumper 50–61s. Update speed-first card to 53.2 / 101.4 SEC and bumper to 25× (1,336 / 53.2 rounded).

For the latest Meta source, match its measured #fdfdfd white and crop 3px from each footage edge inside the rounded mask to hide the recording’s 1px black outer edge.

Remove the TPS-math footer from the final brand screen. Keep the 25× headline and logo reveal.

Transition polish: end Meta 6× playback and clear its badge 200ms before its DONE entrance. Play the final 200ms of the task at 1×, keeping the timer tied to source elapsed time. Fast playback ends at 41.678s; DONE begins at 41.878s. Preserve the 50s bumper start and 61s total runtime.
