import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('../public/replay/session.json', import.meta.url), 'utf8'));
assert.equal(data.version, 2);
for (const timeline of [data, data.launch]) {
  assert.ok(timeline.durationMs > 0 && timeline.events.length > 0);
  let cursor = 0;
  for (const segment of timeline.segments) {
    assert.equal(segment.replayStart, cursor);
    assert.equal(segment.replayEnd - segment.replayStart, segment.sourceEnd - segment.sourceStart);
    assert.ok(timeline.cuts.every(c => segment.sourceEnd <= c.sourceStart || segment.sourceStart >= c.sourceEnd));
    cursor = segment.replayEnd;
  }
  assert.equal(cursor, timeline.durationMs);
  for (const event of timeline.events) {
    assert.ok(['text', 'tool'].includes(event.type));
    assert.ok(event.start >= 0 && event.start <= event.revealAt && event.revealAt <= event.end && event.end <= timeline.durationMs);
    if (event.type === 'text') assert.ok(!/^\s*continu(?:e|ing)\b/i.test(event.text));
  }
  const updates = [...new Set([0, timeline.durationMs, ...timeline.events.flatMap(e => e.type === 'tool' ? [e.start, e.end] : [e.start])])].sort((a,b) => a-b);
  assert.ok(updates.every((t, i) => i === 0 || t - updates[i - 1] <= 3000), 'Long silent replay gap remains');
}
assert.ok(data.events.every(e => e.sourceEnd <= Date.parse('2026-09-21T22:30:51.222Z')), 'Later improvement run leaked into build');
assert.ok(data.launch.events.every(e => e.sourceStart >= Date.parse('2026-09-21T22:31:28.545Z')));
assert.equal(data.removedMs + data.durationMs, data.sourceElapsedMs);
assert.ok(!/frogger|\/Users\/am\.will|\b(?:csk|sk)-[a-z0-9_-]{16,}/i.test(JSON.stringify(data)));
console.log(`Replay verified: ${data.events.length} events, ${data.durationMs / 1000}s, no silent gaps over 3s; launch ${data.launch.durationMs / 1000}s.`);
