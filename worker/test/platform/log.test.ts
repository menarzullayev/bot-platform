import { afterEach, describe, expect, it } from "vitest";
import { log, redact, setLogLevel, setLogSink } from "../../src/log";

const lines: { level: string; line: string }[] = [];
setLogSink((level, line) => lines.push({ level, line }));

afterEach(() => {
  lines.length = 0;
  setLogLevel("info");
});

describe("log", () => {
  it("writes one JSON line with level and msg", () => {
    log("info", "hello", { a: 1 });
    expect(JSON.parse(lines[0].line)).toEqual({ a: 1, level: "info", msg: "hello" });
  });

  it("respects LOG_LEVEL", () => {
    setLogLevel("warn");
    log("info", "x");
    log("debug", "x");
    log("warn", "w");
    log("error", "e");
    expect(lines.map((l) => l.level)).toEqual(["warn", "error"]);
  });

  it("masks secret-looking keys, nested and in arrays", () => {
    log("info", "m", {
      token: "123",
      nested: { Authorization: "Bearer abc", secret_token: "s", ok: "fine" },
      list: [{ api_key: "k" }],
    });
    const out = JSON.parse(lines[0].line);
    expect(out.token).toBe("[redacted]");
    expect(out.nested.Authorization).toBe("[redacted]");
    expect(out.nested.secret_token).toBe("[redacted]");
    expect(out.nested.ok).toBe("fine");
    expect(out.list[0].api_key).toBe("[redacted]");
    expect(lines[0].line).not.toContain("Bearer abc");
  });

  it("masks bot tokens that appear inside strings and errors", () => {
    const t = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
    log("error", `failed ${t}`, { error: new Error(`GET /bot${t}/getMe`), url: `https://x/bot${t}` });
    expect(lines[0].line).not.toContain("ABCDEFGH");
  });

  it("fields cannot override level/msg and redact tolerates deep nesting", () => {
    log("info", "real", { level: "fake", msg: "fake" });
    const out = JSON.parse(lines[0].line);
    expect(out.level).toBe("info");
    expect(out.msg).toBe("real");
    const deep: Record<string, unknown> = {};
    let cur = deep;
    for (let i = 0; i < 20; i++) cur = (cur.n = {}) as Record<string, unknown>;
    expect(() => redact(deep)).not.toThrow();
  });
});
