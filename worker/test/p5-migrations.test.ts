import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteDb } from "./p5-helpers";

const sql = readFileSync(join(process.cwd(), "migrations", "0004_cards_metrics.sql"), "utf8");

describe("0004_cards_metrics.sql", () => {
  it("creates cards and metrics_daily idempotently", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS cards/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS metrics_daily/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_cards_created ON cards \(created_at\)/);
    const db = new SqliteDb();
    expect(() => db.raw.exec(sql)).not.toThrow(); // second application is a no-op
  });

  it("cards has the five columns of DEC-014 plus the nullable mime of 0005", () => {
    const db = new SqliteDb();
    const cols = db.rows<{ name: string; type: string; notnull: number; pk: number }>("PRAGMA table_info(cards)");
    expect(cols.map((c) => [c.name, c.type, c.notnull, c.pk])).toEqual([
      ["id", "TEXT", 0, 1],
      ["bot_id", "TEXT", 1, 0],
      ["user_id", "INTEGER", 1, 0],
      ["png", "BLOB", 1, 0],
      ["created_at", "INTEGER", 1, 0],
      ["mime", "TEXT", 0, 0],
    ]);
  });

  it("metrics_daily has day, bot_id, key, n and a composite primary key", () => {
    const db = new SqliteDb();
    const cols = db.rows<{ name: string; type: string; notnull: number; pk: number; dflt_value: string | null }>("PRAGMA table_info(metrics_daily)");
    expect(cols.map((c) => c.name)).toEqual(["day", "bot_id", "key", "n"]);
    expect(cols.filter((c) => c.pk > 0).map((c) => c.name)).toEqual(["day", "bot_id", "key"]);
    expect(cols.find((c) => c.name === "n")).toMatchObject({ type: "INTEGER", notnull: 1, dflt_value: "0" });
  });

  it("has no per-user column anywhere in metrics_daily (privacy by schema)", () => {
    const db = new SqliteDb();
    const cols = db.rows<{ name: string }>("PRAGMA table_info(metrics_daily)").map((c) => c.name);
    expect(cols.some((c) => /user|uid|ip|text|expr/i.test(c))).toBe(false);
  });

  it("the created_at index exists and serves the purge query", () => {
    const db = new SqliteDb();
    expect(db.rows<{ name: string }>("PRAGMA index_list(cards)").map((i) => i.name)).toContain("idx_cards_created");
    const plan = db.rows<{ detail: string }>("EXPLAIN QUERY PLAN DELETE FROM cards WHERE created_at < 5").map((r) => r.detail).join(" ");
    expect(plan).toContain("idx_cards_created");
  });

  it("a PNG BLOB round-trips byte for byte", () => {
    const db = new SqliteDb();
    const bytes = Uint8Array.from([0x89, 0x50, 0x00, 0xff, 0x10]);
    db.exec("INSERT INTO cards (id, bot_id, user_id, png, created_at) VALUES ('a','b',1,?,5)", bytes);
    const back = db.rows<{ png: Uint8Array }>("SELECT png FROM cards WHERE id='a'")[0].png;
    expect([...back]).toEqual([...bytes]);
  });

  it("the composite key rejects a duplicate and the upsert form accumulates", () => {
    const db = new SqliteDb();
    db.exec("INSERT INTO metrics_daily (day, bot_id, key, n) VALUES ('2026-01-01','b','req',1)");
    expect(() => db.exec("INSERT INTO metrics_daily (day, bot_id, key, n) VALUES ('2026-01-01','b','req',1)")).toThrow();
    db.exec(
      "INSERT INTO metrics_daily (day, bot_id, key, n) VALUES ('2026-01-01','b','req',4) ON CONFLICT(day, bot_id, key) DO UPDATE SET n = n + excluded.n",
    );
    expect(db.metric("2026-01-01", "b", "req")).toBe(5);
  });

  it("n defaults to 0 and is required to be non-null", () => {
    const db = new SqliteDb();
    db.exec("INSERT INTO metrics_daily (day, bot_id, key) VALUES ('d','b','k')");
    expect(db.metric("d", "b", "k")).toBe(0);
    expect(() => db.exec("INSERT INTO metrics_daily (day, bot_id, key, n) VALUES ('d','b','k2',NULL)")).toThrow();
  });

  it("only adds tables: no ALTER, no DROP", () => {
    expect(sql).not.toMatch(/ALTER TABLE|DROP /i);
  });
});
