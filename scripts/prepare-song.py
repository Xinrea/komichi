#!/usr/bin/env python3
"""Convert the archived online LRC into Folia JSON, retaining source text/timing."""
import json
import re
from pathlib import Path
root = Path(__file__).resolve().parents[1] / 'assets/music'
rows = []
for raw in (root / 'daijoyuu-san.lrc').read_text().splitlines():
    match = re.match(r'\[(\d+):(\d+\.\d+)\](.*)', raw)
    if match:
        minute, second, text = match.groups()
        start = int(minute) * 60 + float(second)
        # The online source has credit rows before the actual singing starts.
        if start >= 10 and text.strip():
            rows.append({'start': round(start, 3), 'text': text.strip()})
# Gap endpoints checked against the supplied video; canonical words stay unchanged.
ends = {61.88: 69.0, 123.2: 125.0, 181.25: 189.5}
for i, row in enumerate(rows):
    row['end'] = ends.get(row['start'], rows[i+1]['start'] if i+1 < len(rows) else 189.5)
(root / 'daijoyuu-san.json').write_text(json.dumps({
    'apiVersion': 1, 'title': '大女優さん', 'artist': '四时小路Komichi', 'lines': rows
}, ensure_ascii=False, indent=2) + '\n')
playlist = json.loads((root / 'playlist.json').read_text())
playlist['tracks'][0]['lyrics'] = 'daijoyuu-san.json'
(root / 'playlist.json').write_text(json.dumps(playlist, ensure_ascii=False, indent=2)+'\n')
print(f'Prepared {len(rows)} lines from online LRC')

# Additional covers use downloaded line timings. Blank markers and explicit end
# markers close a sentence without making credits/instrumentals appear as lyrics.
for slug, title, final_end in [('tengoku', '天国', 67.5), ('cho-dari', 'CHO-DARI-', 155.037)]:
    events = []
    for raw in (root / f'{slug}.lrc').read_text().splitlines():
        match = re.match(r'\[(\d+):(\d+(?:\.\d+)?)\](.*)', raw)
        if not match:
            continue
        minute, second, text = match.groups()
        text = text.strip()
        if re.match(r'^(?:作词|作曲|编曲|制作人)\s*[:：]', text):
            continue
        events.append((round(int(minute) * 60 + float(second), 3), text))
    events.sort(key=lambda event: event[0])
    lines = []
    for i, (start, text) in enumerate(events):
        if not text or text == '終わり':
            continue
        end = min(events[i + 1][0] if i + 1 < len(events) else final_end, final_end)
        if end > start:
            lines.append({'start': start, 'end': end, 'text': text})
    (root / f'{slug}.json').write_text(json.dumps({
        'apiVersion': 1, 'title': title, 'artist': '四时小路Komichi', 'lines': lines,
    }, ensure_ascii=False, indent=2) + '\n')
    print(f'Prepared {slug}: {len(lines)} lines from online LRC')
