"""Package unchanged native browser screenshots as sampled motion playback.
No generated/interpolated/resized image content; WebP encoding only.
The pauses at each end aid review. This is not a continuous 60fps recording.
"""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent
sequences = [
    ('v1-390-fast', 'Level 11 · 390×844 · 3 bends'),
    ('A-390-working-fast', 'A · 44 paths · 390×844 · 2.25× · 4 bends'),
    ('B-390-working-fast', 'B · 66 paths · 390×844 · 2.25× · 3 bends'),
    ('v1-320-fast', 'Level 11 · 320×568 · 3 bends'),
    ('A-320-working-fast', 'A · 44 paths · 320×568 · 2.25× · 4 bends'),
    ('B-320-working-fast', 'B · 66 paths · 320×568 · 3.375× · 3 bends'),
    ('A-landscape-working-fast', 'A · 844×390 · 2.25× · 4 bends'),
    ('B-landscape-working-fast', 'B · 844×390 · 3.375× · 3 bends'),
]
summary = []
for prefix, title in sequences:
    record = json.loads((root / f'{prefix}.json').read_text())
    captures = record['frames']
    images = [Image.open(root / f'{prefix}-stationary.jpg').convert('RGB')]
    images += [Image.open(root / frame['file']).convert('RGB') for frame in captures]
    assert len({image.size for image in images}) == 1, prefix
    mids = [(frame['beginMs'] + frame['endMs']) / 2 for frame in captures]
    durations = [650] + [max(16, round(b-a)) for a,b in zip(mids,mids[1:])] + [650]
    output = root / f'{prefix}.webp'
    inputs = [root / f'{prefix}.json',root / f'{prefix}-stationary.jpg'] + [root / frame['file'] for frame in captures]
    if not output.exists() or output.stat().st_mtime < max(file.stat().st_mtime for file in inputs):
        images[0].save(output, format='WEBP', save_all=True,
                       append_images=images[1:], duration=durations, lossless=True, loop=0, method=4)
    summary.append({'prefix': prefix, 'title': title, 'size': images[0].size,
                    'capturedFrames': len(captures), 'final': record['final']})
    for image in images:
        image.close()

audit = []
for file in sorted(root.glob('*.jpg')):
    with Image.open(file) as image:
        expected = ((320,568) if '-320' in file.name else (390,844) if '-390' in file.name
                    else (844,390) if '-landscape' in file.name else None)
        audit.append({'file': file.name, 'size': image.size, 'expected': expected,
                      'matchesLabel': expected is None or image.size == expected})
(root / 'IMAGE_AUDIT.json').write_text(json.dumps(audit,indent=2)+'\n')
(root / 'MOTION_SUMMARY.json').write_text(json.dumps(summary,indent=2)+'\n')

# Independent read-only pixel evidence: dark teal moving body vs pale source dots
# in the selected A arrow's source region, excluding HUD and floating controls.
pixels = []
capture = json.loads((root / 'A-390-working-fast.json').read_text())
path = [(307.71875,267.15625),(260.1875,267.15625),(260.1875,219.625),
        (260.1875,172.09375),(260.1875,124.5625),(307.71875,124.5625),
        (307.71875,172.09375),(355.25,172.09375)]
dot_centers = []
for index, (a,b) in enumerate(zip(path,path[1:])):
    dot_centers.append((index, a))
    dot_centers.append((index+.5, ((a[0]+b[0])/2,(a[1]+b[1])/2)))
dot_centers.append((7,path[-1]))
for frame in capture['frames']:
    with Image.open(root / frame['file']).convert('RGB') as image:
        body, dots = [], []
        for y in range(116,276):
            for x in range(252,374):
                r,g,b = image.getpixel((x,y))
                if g-r > 18 and b-r > 15 and g > 70:
                    (body if r < 100 else dots).append((x,y))
        revealed = []
        for distance, (cx,cy) in dot_centers:
            nearby = [image.getpixel((round(cx)+dx,round(cy)+dy)) for dx in range(-3,4) for dy in range(-3,4)]
            # Tiny JPEG dots lose chroma through subsampling. Probe brightness
            # at isolated source centers, excluding both static ink and teal body.
            has_body = any(r<100 and g<180 for r,g,b in nearby)
            has_dot = any(100<r<235 and g<242 and b<242 for r,g,b in nearby)
            if has_dot and not has_body:
                revealed.append(distance)
        pixels.append({**frame,'movingBodyPixels':len(body),'lightTealPixelsIncludingAntialiasing':len(dots),
                       'detectedSourceDots':revealed,'detectedSourceDotCount':len(revealed),
                       'movingBodyBounds':None if not body else [min(p[0] for p in body),min(p[1] for p in body),max(p[0] for p in body),max(p[1] for p in body)]})
(root / 'PIXEL_TRAIL_PROGRESSION.json').write_text(json.dumps(pixels,indent=2)+'\n')

def figure(file, caption):
    return f'<figure><a href="{file}"><img src="{file}" loading="lazy" alt="{caption}"></a><figcaption>{caption}</figcaption></figure>'

html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FLOWLINE Phase 4.7 — Actual motion and hold evidence</title><style>
body{margin:0;padding:24px;background:#f7f4ed;color:#24333a;font:15px/1.6 system-ui,sans-serif}main{max-width:1250px;margin:auto}h1{font-size:28px}h2{font-size:21px;margin-top:40px}a{color:#087c76}.grid{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}figure{margin:0;max-width:280px;background:#fffdf9;padding:12px;border-radius:14px}img{display:block;width:100%;height:auto}figcaption{font-size:13px;margin-top:10px}code{font-size:12px}table{border-collapse:collapse;font-size:13px}td,th{padding:8px;border-bottom:1px solid #dce6e8;text-align:left}.wide figure{max-width:550px}p{max-width:1000px}</style><main>
<h1>FLOWLINE · Phase 4.7 actual browser evidence</h1>
<p>Every image is an actual native-size browser capture of real engine gameplay. Animated WebP files assemble those same captured frames at approximate recorded intervals, with review pauses at the ends. No interpolated or generated frames, resizing, mock interactions or attached audio. This is sampled screenshot playback, not a continuous 60fps screen recording.</p>
<p><strong>Motion diagnosis:</strong> both system and stored reduced motion are on here. Production correctly settles immediately. Full-travel evidence uses the intentional, session-only research-lab override with the same renderer, input, immutable engine and feedback service. Production preferences are preserved.</p>
<p><a href="/research/dense-v2/">Play the shared-renderer lab</a> · <a href="http://127.0.0.1:4173/">Production game</a> · <a href="/docs/PHASE_04_7_HANDOFF.md">Detailed handoff</a> · <a href="IMAGE_AUDIT.json">Native image audit</a></p>
<h2>390×844 · Follow the same tail through its bends</h2><div class="grid">'''
for row in summary[:3]:
    html += figure(row['prefix']+'.webp', row['title']+' · stationary → winding departure → progressive dots → removal → fade. Raw timestamps: '+row['prefix']+'.json')
html += '</div><h2>Annotated milestones · A, arrow 021</h2><p>The original tail runs left, up, right, down, then right. Look at the upper-right teal path. Its tail follows each source turn while its head advances right. Dots occupy only the vacated centerline. Images below are unaltered; annotations are these captions.</p><div class="grid">'
for suffix, caption in [('stationary','1 · Original stationary winding path.'),('04','2 · Tail reaches the original lower-left turn; dots occupy the first vacated segment.'),('05','3 · Tail continues up the original path toward its upper turns.'),('06','4 · Tail has negotiated more original turns; the dot trace extends behind it.'),('12','5 · Engine has removed the path; original dotted source fades.'),('30','6 · Clean end state; dots are gone.')]:
    html += figure('A-390-working-fast-'+suffix+'.jpg',caption)
html += '</div><h2>Hold → truthful first-blocker ruler → release</h2><p>A/seed 0: arrow 034 points left, and arrow 037 is the real first blocker. Coral contact cross and faded unreachable lane are visual only. Before, during and after: 44 paths, three hearts, zero attempts. Production Level 11 shows the same no-penalty behavior.</p><div class="grid">'
for file, caption in [('A-390-blocked-hold-before.jpg','Before · 44 paths / 3 hearts / 0 attempts.'),('A-390-blocked-hold-held-06.jpg','Held · full selected shape, ruler and actual first contact.'),('A-390-blocked-hold-released.jpg','Released · preview gone; counters unchanged.'),('production-320-blocked-hold-held-06.jpg','Production 320×568 · arrow 003 previews actual blocker 004. No audio context or move is created.')]:
    html += figure(file,caption)
html += '</div><h2>320×568 · Same real rules and motion</h2><div class="grid">'
for row in summary[3:6]:
    html += figure(row['prefix']+'.webp',row['title']+' · no stretching, real pan/zoom, finite dots.')
html += '</div><h2>844×390 · Landscape working views</h2><div class="grid wide">'
for row in summary[6:]:
    html += figure(row['prefix']+'.webp',row['title']+' · HUD and controls stay outside the safe drawing area.')
html += '</div><h2>Measured captured runs</h2><table><tr><th>Case</th><th>Duration / elapsed ms</th><th>Frames / max gap ms</th><th>CPU draw p95 / maximum ms</th></tr>'
for row in summary:
    d = row['final']
    html += f"<tr><td>{row['title']}</td><td>{d['extractionDurationMs']} / {d['extractionElapsedMs']}</td><td>{d['extractionFrames']} / {d['extractionMaxGapMs']}</td><td>{float(d['sampledPaintP95Ms']):.2f} / {d['maxPaintMs']}</td></tr>"
html += '''</table><p>Desktop browser only. CPU costs exclude compositor/input/audio/device overhead; maximum draw covers that whole installed sample, including pan/hold. One B small-phone draw reached 26.5ms. The A working capture had a 67.4ms maximum gap; an earlier heavily instrumented A overview capture had a 190ms gap (A-390-motion.json). These recording costs are retained, not hidden. Separate no-frame-capture measurements are in QUIET_MOTION_RUNS.json. Physical Android motion, multitouch, audible quality and vibration strength remain unverified. Read-only pixel probes in PIXEL_TRAIL_PROGRESSION.json show the dark-teal body vacating its source and pale dots appearing then fading. Dot detection uses brightness at the isolated source centers and excludes nearby dark ink/body; JPEG subsampling desaturates tiny dots, and faint/antialiased dots can fall below the threshold. Light pixels around body edges are explicitly not counted as dots.</p>
<h2>Genuine terminal states and mute</h2><div class="grid">'''
html += figure('A-real-victory.jpg','44 real legal exits · Challenge victory with all three hearts; victory synthesis event verified running.')
html += figure('A-real-defeat.jpg','Three real blocked taps · genuine Challenge defeat. Zen retains unlimited retries.')
html += figure('B85-keyboard-preview.jpg','85-path board · keyboard preview makes zero attempts. Escape dismisses; Enter then clears exactly one path while muted.')
html += '</div><p>Raw checks: <a href="PRODUCTION_INTERACTION.json">production hold/block/reduced extraction</a> · <a href="B85_MUTED_KEYBOARD.json">85-path mute/keyboard</a> · <a href="INTERRUPTED_BROWSER_MOVE.json">pause cancellation</a> · <a href="VICTORY_AUDIO.json">victory audio</a> · <a href="BROWSER_LAYOUTS.json">layout matrix</a></p></main></html>'
(root / 'gallery.html').write_text(html,encoding='utf8')
print(json.dumps({'animations':len(summary),'auditedImages':len(audit),'labelMismatches':[x for x in audit if not x['matchesLabel']]}))
