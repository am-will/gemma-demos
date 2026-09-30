#!/usr/bin/env python3
"""Rebuild this variant and retain its custom prompt weight and rounded speed label."""
import json
import html
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent
builder = Path.home() / '.codex/skills/cerebras-agent-comparison/scripts/build_variant.py'
if '--style-only' not in sys.argv:
    subprocess.run([sys.executable, str(builder), str(root / 'comparison.json'), str(root), '--prepare'], check=True)
cfg = json.loads((root / 'comparison.json').read_text())
path = root / 'index.html'
text = path.read_text()
text = text.replace("font:400 40px/1.5 'Instrument Sans'", f"font:{cfg['intro_font_weight']} 40px/1.5 'Instrument Sans'")
text = text.replace(f'>{cfg["speedup"]:g}×</div>', f'>{cfg["speedup_label"]}×</div>')
text = text.replace(f'Meta playback sped up {cfg["speedup"]:g} times', f'Meta playback sped up approximately {cfg["speedup_label"]} times')
if '.brand-copy{' not in text:
    text = text.replace('</style>', '.brand-copy{display:flex;flex-direction:column;gap:2px;line-height:1.15}\n.brand-subtitle{font-size:16px;font-weight:600;letter-spacing:0;line-height:1.3;color:#686866}\n</style>')
for title, subtitle in [
    ('Cerebras', 'Meta Muse Spark 1.2, running on Cerebras'),
    ('Meta AI API', 'Meta Muse Spark 1.2, running on Meta Model API'),
]:
    text = text.replace(f'>{title}</div>', f'><span class="brand-copy"><span>{title}</span><span class="brand-subtitle">{html.escape(subtitle)}</span></span></div>')
path.write_text(text)
