"""Export a presentation-only, sanitized replay. Never modify the source DB."""
import collections
import datetime as dt
import json
from pathlib import Path
import re
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
SESSION = 'ses_f39eeb256ffeBWp3Qhq1yAHkfO'
DB = Path.home() / '.local/share/opencode/opencode.db'


def timestamp(value):
    return int(dt.datetime.fromisoformat(value).timestamp() * 1000)


def clean(value):
    text = str(value or '')
    text = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', text)
    text = text.replace('/Users/am.will/Applications/frogger', '~/voxel-crossing')
    text = text.replace('/Users/am.will', '~')
    text = re.sub(r'Frogger(?:-style| style)?', 'Voxel Crossing', text)
    text = text.replace('frogger', 'voxel-crossing')
    text = text.replace('FROGGER', 'CROSSING')
    text = re.sub(r'(?i)\b(?:sk|csk)-[a-z0-9_-]{16,}', '[REDACTED]', text)
    text = re.sub(r'(?i)(authorization\s*[:=]\s*[\"\']?bearer\s+)\S+', r'\1[REDACTED]', text)
    text = re.sub(r'(?i)((?:api[_-]?key|access[_-]?token|password)\s*[=:]\s*[\"\']?)([a-z0-9_\-]{16,})', r'\1[REDACTED]', text)
    return text.strip()


def prose(value):
    text = clean(value)
    text = re.sub(r'^\s*Continuing\s*[—–-]\s*', '', text, flags=re.I)
    text = text.replace('before continuing with the remaining files', 'before implementing the remaining files')
    # The original launch is deferred to the viewer's typed command in this edit.
    text = text.split('\n\nThe game is still running:')[0]
    return text


def language(path):
    return {'.ts': 'typescript', '.js': 'javascript', '.json': 'json', '.css': 'css', '.html': 'xml', '.md': 'markdown'}.get(Path(path).suffix, 'plaintext')


def tool_payload(part):
    state = part.get('state', {})
    data = state.get('input', {})
    tool = part.get('tool', 'tool')
    path = clean(data.get('filePath') or data.get('path') or '')
    if path.startswith('~/voxel-crossing/'):
        path = path[len('~/voxel-crossing/'):]
    base = {'tool': tool, 'path': path, 'status': state.get('status', 'completed'),
            'output': clean(state.get('output') or state.get('error')),
            'truncated': bool(state.get('metadata', {}).get('truncated'))}
    if tool == 'write':
        base.update(title='Write file', code=clean(data.get('content')), language=language(path))
    elif tool == 'edit':
        base.update(title='Edit file', before=clean(data.get('oldString')), code=clean(data.get('newString')), language=language(path))
    elif tool == 'bash':
        base.update(title='Run command', code=clean(data.get('command')), language='bash')
    elif tool == 'read':
        base.update(title='Read file', code=base.pop('output'), output='', language=language(path))
    elif tool == 'grep':
        base.update(title='Search files', code=clean(data.get('pattern')), language='plaintext')
    elif tool == 'todowrite':
        base.update(title='Implementation plan', code='\n'.join(clean(t.get('content')) for t in data.get('todos', [])), language='plaintext')
    else:
        base.update(title='Load verification instructions', code=clean(data.get('name')), language='plaintext')
        # Skill instructions are input material, not agent dialogue. Keep the load event only.
        base['output'] = ''
    return base


# Video inspection: 10 fps frame differences of the transcript region, excluding
# the spinner/caret/sidebar, followed by visual review of the static intervals.
# These are video seconds, not assumed model token timings. Keep a brief visual
# beat at each boundary; remove the explicit 0:28–0:53 stall in full.
VIDEO_START = timestamp('2026-09-21T22:25:44+00:00')
STATIC_CUTS = [
    (0.8, 5.3), (28, 53), (55.2, 57.9), (66.2, 85.9),
    (96.4, 105.4), (110.7, 116.8), (123.8, 126.5), (143.2, 147.7),
    (155.4, 175.45),  # external-directory permission request, through completion
    (204.4, 210.4), (217, 219.2), (235.1, 248.4), (251, 255),
    (260.9, 263.3), (266.9, 269.9), (280.7, 300.9),
]
BUILD_START = timestamp('2026-09-21T22:25:36.740+00:00')
BUILD_END = timestamp('2026-09-21T22:30:51.222+00:00')
LAUNCH_START = timestamp('2026-09-21T22:31:28.545+00:00')
LAUNCH_END = timestamp('2026-09-21T22:31:35+00:00')

connection = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
connection.row_factory = sqlite3.Row
rows = list(connection.execute('SELECT * FROM message WHERE session_id=? ORDER BY time_created, id', (SESSION,)))
omitted = collections.Counter()


def merge(intervals):
    result = []
    for start, end in sorted(intervals):
        if end <= start:
            continue
        if result and start <= result[-1][1]:
            result[-1][1] = max(end, result[-1][1])
        else:
            result.append([start, end])
    return result


def export_window(window_start, window_end, video_cuts=()):
    turns, raw_events = [], []
    for row in rows:
        message = json.loads(row['data'])
        start = message.get('time', {}).get('created', row['time_created'])
        finish = message.get('time', {}).get('completed', start)
        if not window_start <= start < window_end:
            continue
        if message.get('role') != 'assistant' or message.get('summary'):
            omitted['userPromptsAndCompactions'] += 1
            continue
        parts = []
        for p in connection.execute('SELECT * FROM part WHERE message_id=? ORDER BY time_created,id', (row['id'],)):
            data = json.loads(p['data'])
            if data.get('type') == 'tool' or (data.get('type') == 'text' and data.get('text', '').strip()):
                parts.append((p, data))
        if not parts:
            continue
        finish = min(finish, window_end)
        turns.append([start, finish])
        for p, data in parts:
            is_tool = data.get('type') == 'tool'
            times = data.get('state', {}).get('time', {}) if is_tool else data.get('time', {})
            source_at = p['time_created'] if is_tool else times.get('start', p['time_created'])
            source_end = times.get('end', p['time_updated'])
            at = max(start, min(finish, source_at))
            until = max(at, min(finish, source_end))
            event = {'id': p['id'], 'type': 'tool' if is_tool else 'text', 'sourceStart': at, 'sourceEnd': until}
            event.update(tool_payload(data) if is_tool else {'text': prose(data.get('text'))})
            raw_events.append(event)

    cuts = [(VIDEO_START + round(a * 1000), VIDEO_START + round(b * 1000)) for a, b in video_cuts]
    # Saved text-part end times often include generation of the NEXT tool's
    # arguments. They are not per-token timings. A text block appears at start;
    # a command/file payload appears at tool start; its result appears at end.
    checkpoints = sorted({e['sourceStart'] for e in raw_events} | {e['sourceEnd'] for e in raw_events if e['type'] == 'tool'})
    # Cut any remaining long invisible thinking/wait, including the opening
    # pause before the recording. Retain one second to establish each block.
    for a, b in zip([window_start] + checkpoints, checkpoints + [turns[-1][1]]):
        if b - a > 3000:
            cuts.append((a + 1000, b))
    cuts = merge(cuts)
    segments = []
    cursor = 0
    for start, finish in turns:
        remaining = [[start, finish]]
        for cut_start, cut_end in cuts:
            pieces = []
            for a, b in remaining:
                if cut_end <= a or cut_start >= b:
                    pieces.append([a, b])
                else:
                    if a < cut_start: pieces.append([a, cut_start])
                    if cut_end < b: pieces.append([cut_end, b])
            remaining = pieces
        for a, b in remaining:
            segments.append({'sourceStart': a, 'sourceEnd': b, 'replayStart': cursor, 'replayEnd': cursor + b - a})
            cursor += b - a

    def mapped(source):
        for segment in segments:
            if source <= segment['sourceStart']:
                return segment['replayStart']
            if source < segment['sourceEnd']:
                return segment['replayStart'] + source - segment['sourceStart']
        return cursor

    events = []
    for event in raw_events:
        event['start'] = mapped(event['sourceStart'])
        event['end'] = mapped(event['sourceEnd'])
        # Read contents are results, not an input typed over the read duration.
        event['revealAt'] = event['end'] if event.get('tool') == 'read' else event['start']
        events.append(event)
    events.sort(key=lambda e: (e['start'], e['sourceStart'], e['id']))
    return {'durationMs': cursor, 'sourceElapsedMs': turns[-1][1] - window_start,
            'segments': segments, 'events': events,
            'cuts': [{'sourceStart': a, 'sourceEnd': b} for a, b in cuts]}


build = export_window(BUILD_START, BUILD_END, STATIC_CUTS)
launch = export_window(LAUNCH_START, LAUNCH_END)
result = {
    'version': 2, 'sessionId': SESSION, 'title': 'Voxel Crossing',
    'provider': 'Cerebras', 'model': 'Qwen 3.8 27B',
    **build, 'removedMs': build['sourceElapsedMs'] - build['durationMs'],
    'launch': launch,
    'timing': 'Edited first implementation only. Retained source intervals play at 1x. Video-reviewed static waits, permission pause, compactions, follow-ups and long gaps without visible output are cut. Whole text and tool payloads appear in bursts; results appear at saved completion times. No per-token interpolation.',
    'editorialChanges': ['Corrected opening prompt', 'Follow-up prompts omitted', 'Continuation preamble removed', 'Project naming normalized', 'Local paths and credential-shaped strings sanitized', 'Later improvement runs omitted', 'Original run-it response reserved for manual launch'],
    'recordings': [{'name': 'CleanShot 2026-09-21 at 4.25.44 PM.mp4', 'startUtc': '2026-09-21T22:25:44Z', 'durationSeconds': 317.055, 'inspectionSampleFps': 10, 'staticCutSeconds': STATIC_CUTS}],
    'omitted': dict(omitted),
}
destination = ROOT / 'public/replay/session.json'
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
print(json.dumps({'durationSeconds': build['durationMs'] / 1000, 'launchSeconds': launch['durationMs'] / 1000, 'events': len(build['events']), 'tools': sum(e['type'] == 'tool' for e in build['events']), 'removedSeconds': result['removedMs'] / 1000, 'file': str(destination)}, indent=2))
