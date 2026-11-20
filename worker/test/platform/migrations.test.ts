import { readFileSync } from "node:fs";
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
});
