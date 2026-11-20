import { describe, expect, it } from "vitest";
import { RateLimiter, UpdateDedup } from "../../src/ratelimit";

describe("RateLimiter", () => {
  it("allows a burst up to capacity, then limits", () => {
    const rl = new RateLimiter({ capacity: 3, windowMs: 3000 });
    expect([1, 2, 3, 4].map(() => rl.limited("b:1", 0))).toEqual([false, false, false, true]);
  });
  it("refills over time", () => {
    const rl = new RateLimiter({ capacity: 2, windowMs: 2000 });
    rl.limited("k", 0);
    rl.limited("k", 0);
    expect(rl.limited("k", 0)).toBe(true);
    expect(rl.limited("k", 1000)).toBe(false); // 1 token refilled
    expect(rl.limited("k", 1000)).toBe(true);
  });
  it("keys are independent", () => {
    const rl = new RateLimiter({ capacity: 1, windowMs: 1000 });
    expect(rl.limited("b:1", 0)).toBe(false);
    expect(rl.limited("b:2", 0)).toBe(false);
    expect(rl.limited("b:1", 0)).toBe(true);
  });
  it("defaults to 20 per 10 s", () => {
    const rl = new RateLimiter();
    let limited = 0;
    for (let i = 0; i < 25; i++) if (rl.limited("k", 0)) limited++;
    expect(limited).toBe(5);
  });
});

describe("UpdateDedup", () => {
  it("flags repeats per bot only", () => {
    const d = new UpdateDedup();
    expect(d.isDuplicate("a", 1, 0)).toBe(false);
    expect(d.isDuplicate("a", 1, 1)).toBe(true);
    expect(d.isDuplicate("b", 1, 1)).toBe(false);
  });
  it("forgets after TTL", () => {
    const d = new UpdateDedup({ maxEntries: 10, ttlMs: 1000 });
    d.isDuplicate("a", 1, 0);
    expect(d.isDuplicate("a", 1, 1500)).toBe(false);
  });
  it("evicts the oldest beyond maxEntries", () => {
    const d = new UpdateDedup({ maxEntries: 3, ttlMs: 60_000 });
    for (let i = 1; i <= 4; i++) d.isDuplicate("a", i, i);
    expect(d.isDuplicate("a", 1, 10)).toBe(false); // evicted
    expect(d.isDuplicate("a", 4, 11)).toBe(true);
  });
});
