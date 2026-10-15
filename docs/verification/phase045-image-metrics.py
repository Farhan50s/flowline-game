"""Measure original screenshot pixels; never resizes or alters the source captures.

Run with Python + Pillow. Dark-pixel threshold excludes pale grid dots, shadows and
ivory backgrounds. Restricting to the canvas/safe region excludes HUD typography.
This measures a stroke bounding box, not level occupancy or logical difficulty.
"""
import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
before = json.loads((ROOT / "PHASE_04_5_BASELINE_LAYOUTS.json").read_text())
after = json.loads((ROOT / "PHASE_04_5_AFTER_LAYOUTS.json").read_text())


def measure(filename, region, viewport, phase, level):
    image = Image.open(ROOT / filename).convert("RGB")
    sx, sy = image.width / viewport[0], image.height / viewport[1]
    # The pre-redesign full-page capture tool scaled the two scrolling pages.
    # Keep those original files intact and label CSS-normalized estimates. The
    # acceptance comparison at 390x844 and every after capture are unscaled.
    assert abs(sx - sy) < .005, (filename, image.size, viewport)
    left, top = math.floor(region["x"] * sx), math.floor(region["y"] * sy)
    right = math.ceil((region["x"] + region["width"]) * sx)
    bottom = math.ceil((region["y"] + region["height"]) * sy)
    points = []
    for y in range(max(0, top), min(image.height, bottom)):
        for x in range(max(0, left), min(image.width, right)):
            r, g, b = image.getpixel((x, y))
            if r < 100 and g < 120 and b < 125:
                points.append((x, y))
    assert points, filename
    xs, ys = zip(*points)
    width, height = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
    return {
        "phase": phase, "level": level, "image": filename,
        "viewport": viewport, "imageDimensions": list(image.size), "captureScale": [sx, sy],
        "cssNormalizedEstimate": sx != 1 or sy != 1, "measuredRegion": region,
        "strokeBounds": {"x": min(xs), "y": min(ys), "width": width, "height": height},
        "strokeBoundsCSS": {"x": min(xs) / sx, "y": min(ys) / sy, "width": width / sx, "height": height / sy},
        "strokeBoundsWidthOfRegion": width / sx / region["width"],
        "strokeBoundsAreaOfViewport": width * height / (image.width * image.height),
        "darkPixelCount": len(points),
        "darkPixelsOfRegion": len(points) / (region["width"] * sx * region["height"] * sy),
    }


results = [measure(f"phase045-before-{m['viewport'][0]}.jpg", m["canvas"], m["viewport"], "before", 11) for m in before]
for m in after:
    w, h = m["viewport"]["width"], m["viewport"]["height"]
    level = int(m["level"].split()[-1])
    results.append(measure(f"phase045-after-level{level}-{w}.jpg", json.loads(m["data"]["safeRect"]), [w, h], "after", level))
(ROOT / "PHASE_04_5_IMAGE_METRICS.json").write_text(json.dumps(results, indent=2) + "\n")
for result in results:
    print(result["phase"], result["level"], result["viewport"], result["strokeBounds"], round(result["strokeBoundsWidthOfRegion"] * 100, 2))
