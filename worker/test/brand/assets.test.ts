import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PRO_STARS } from "../../src/pro";

const OUT = join(__dirname, "..", "..", "..", "brand", "out");
const SRC = join(__dirname, "..", "..", "..", "brand", "src");
const tokens = JSON.parse(readFileSync(join(SRC, "tokens.json"), "utf8")) as Record<string, string>;

// name, width, height, max bytes
const JPEGS: [string, number, number, number][] = [
  ["avatar.jpg", 640, 640, 60_000],
  ["description.jpg", 640, 360, 80_000],
  ["stars-pro.jpg", 640, 360, 80_000],
  ["thumb-calc.jpg", 128, 128, 10_000],
  ["thumb-convert.jpg", 128, 128, 10_000],
  ["thumb-loan.jpg", 128, 128, 10_000],
  ["thumb-error.jpg", 128, 128, 10_000],
  ["og.jpg", 1200, 630, 80_000],
];

/** Width/height from the first SOF marker. */
function jpegSize(b: Buffer): { w: number; h: number } {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error("bad marker");
    const m = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error("no SOF");
}

describe("brand/out JPEG assets", () => {
  for (const [name, w, h, max] of JPEGS) {
    it(`${name}: exists, JPEG magic, ${w}x${h}, <= ${max} B`, () => {
      const p = join(OUT, name);
      expect(existsSync(p)).toBe(true);
      const b = readFileSync(p);
      expect([b[0], b[1], b[2]]).toEqual([0xff, 0xd8, 0xff]);
      expect([b[b.length - 2], b[b.length - 1]]).toEqual([0xff, 0xd9]);
      expect(jpegSize(b)).toEqual({ w, h });
      expect(statSync(p).size).toBeLessThanOrEqual(max);
    });
  }
});

describe("brand/out SVG assets", () => {
  for (const name of ["mark.svg", "favicon.svg"]) {
    const svg = () => readFileSync(join(OUT, name), "utf8");
    it(`${name}: well-formed, no external references, no unresolved placeholders`, () => {
      expect(existsSync(join(OUT, name))).toBe(true);
      expect(svg()).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(svg()).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
      expect(svg()).not.toMatch(/xlink:href|<image|<script|<foreignObject|@import|url\((?!#)/);
      expect(svg()).not.toContain("{{");
    });
    it(`${name}: colours come only from the brand tokens`, () => {
      const allowed = new Set(Object.values(tokens).map((c) => c.toLowerCase()));
      const found = svg().match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(found.length).toBeGreaterThan(0);
      for (const c of found) expect(allowed.has(c.toLowerCase())).toBe(true);
    });
  }
});

describe("brand sources", () => {
  it("every colour in brand/src SVGs is a placeholder (no hard-coded hex)", () => {
    for (const n of ["mark", "favicon", "avatar", "description", "stars-pro", "og", "thumb-calc", "thumb-convert", "thumb-loan", "thumb-error"]) {
      const s = readFileSync(join(SRC, `${n}.svg`), "utf8");
      expect(s.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
      expect(s).not.toMatch(/<text/); // text is converted to paths
    }
  });
  it("accent tokens match DEC-009", () => {
    expect(tokens.accent).toBe("#ab3409");
    expect(tokens.accentDark).toBe("#ff9254");
    expect(tokens.accent2).toBe("#b4231f");
    expect(tokens.accent2Dark).toBe("#ff6f91");
  });
  it("the Stars card shows the default price", () => {
    const glyphs = JSON.parse(readFileSync(join(SRC, "glyphs.json"), "utf8")) as Record<string, unknown>;
    expect(glyphs.star150).toBeDefined();
    expect(DEFAULT_PRO_STARS).toBe(150);
  });
});
