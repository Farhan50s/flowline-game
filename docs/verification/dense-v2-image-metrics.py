"""Measure native browser captures without changing any image pixels (Pillow).
Dark ink/teal threshold is restricted to the actual safe play rectangle, excluding
HUD/controls. JPEG/anti-aliasing make bounding boxes approximate by a few pixels.
"""
from pathlib import Path
import json
from PIL import Image

root = Path(__file__).resolve().parent
layouts = json.loads((root / "DENSE_V2_BROWSER_LAYOUTS.json").read_text())
records = []
def pixels(image):
    return image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()

for layout in layouts:
    image = Image.open(root / layout["image"]).convert("RGB")
    viewport = layout["viewport"]
    assert image.size == (viewport["width"], viewport["height"]), layout["image"]
    rect = json.loads(layout["data"]["safeRect"])
    x, y, w, h = (int(rect[key]) for key in ["x", "y", "width", "height"])
    crop = image.crop((x, y, x+w, y+h))
    mask = Image.new("L", crop.size)
    mask.putdata([255 if r < 100 and g < 170 and b < 170 else 0 for r, g, b in pixels(crop)])
    bounds = mask.getbbox()
    assert bounds, layout["image"]
    count = sum(v > 0 for v in pixels(mask))
    record = {
        "image": layout["image"], "family": layout["data"]["family"],
        "arrowCount": int(layout["data"]["arrows"]), "viewport": viewport,
        "zoom": float(layout["data"]["zoom"]), "safe": rect,
        "strokeBounds": {"x": x+bounds[0], "y": y+bounds[1], "width": bounds[2]-bounds[0], "height": bounds[3]-bounds[1]},
        "inkPixels": count, "inkFractionOfSafeRect": count / (w*h),
        "inkFractionOfViewport": count / (image.width*image.height),
    }
    records.append(record)
    if record["zoom"] == 1:
        print(record["image"], record["strokeBounds"], "safe ink %", round(record["inkFractionOfSafeRect"]*100, 2))
(root / "DENSE_V2_IMAGE_METRICS.json").write_text(json.dumps({
    "note": "Actual native-size JPEG pixels, RGB r<100/g<170/b<170 in the shared safe rectangle. This is screen ink coverage, not logical cell occupancy. Zoomed bounds are clipped; selected teal is included.",
    "records": records,
}, indent=2) + "\n")
