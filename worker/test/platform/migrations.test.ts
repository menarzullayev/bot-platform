import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(process.cwd(), "migrations", f), "utf8");

describe("migrations", () => {
  it("0001 creates the platform tables", () => {
    const s = read("0001_init.sql");
    expect(s).toMatch(/CREATE TABLE IF NOT EXISTS bots/);
    expect(s).toMatch(/CREATE TABLE IF NOT EXISTS bot_users/);
  });
  it("0002 creates the calc tables and the history index", () => {
    const s = read("0002_calc.sql");
    for (const t of ["users", "history", "fx_rates", "payments"]) expect(s).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    expect(s).toContain("(bot_id, user_id, id DESC)");
  });
  it("0003 adds the five nullable look-and-feel columns to users (no defaults, no NOT NULL)", () => {
    const s = read("0003_style.sql");
    const adds = [...s.matchAll(/^ALTER TABLE users ADD COLUMN (\w+)\s+(.*?);$/gm)];
    expect(adds.map((m) => m[1])).toEqual(["style", "contrast", "density", "lite", "fs"]);
    for (const m of adds) expect(m[2]).toBe("TEXT");
  });
  it("migration files are numbered without gaps", () => {
    const files = readdirSync(join(process.cwd(), "migrations")).filter((f) => f.endsWith(".sql")).sort();
    files.forEach((f, i) => expect(f.startsWith(String(i + 1).padStart(4, "0") + "_"), f).toBe(true));
  });
});
