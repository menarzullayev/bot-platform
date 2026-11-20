"""One-off helper: turn short strings into SVG <path> data (Roboto Medium, Apache-2.0).

Output: brand/src/glyphs.json  {name: {d, w}} in a coordinate system where 1 em = 100 units,
baseline y = 0, y axis pointing down. build.mjs places each string with translate/scale, so the
final images never depend on fonts installed on the build machine.

Run only when a string changes:  python brand/tools/text2path.py <path-to-Roboto-Medium.ttf>
"""
import json, sys, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

TEXTS = {
    "wordmark": ("TezCalc", {("T", "e"): -3.5, ("a", "l"): 0}),
    "tagline": ("12 \u00d7 8 = 96  \u00b7  5 km = 3.1 mi  \u00b7  15%", {}),
    "pro": ("Pro", {}),
    "star150": ("150", {}),
}

font = TTFont(sys.argv[1])
cmap = font.getBestCmap()
gs = font.getGlyphSet()
upm = font["head"].unitsPerEm
k = 100.0 / upm
out = {}
for name, (text, kern) in TEXTS.items():
    x = 0.0
    parts = []
    prev = None
    for ch in text:
        if ord(ch) not in cmap:
            raise SystemExit(f"missing glyph {ch!r}")
        if prev is not None:
            x += kern.get((prev, ch), 0)
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
        gs[g].draw(TransformPen(pen, (k, 0, 0, -k, x, 0)))
        d = pen.getCommands()
        if d:
            parts.append(d)
        x += font["hmtx"][g][0] * k
        prev = ch
    out[name] = {"d": "".join(parts), "w": round(x, 2)}
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "..", "src", "glyphs.json"), "w", encoding="utf8") as f:
    json.dump(out, f, indent=1, ensure_ascii=False)
print({n: v["w"] for n, v in out.items()})
