import { afterEach, describe, expect, it } from "vitest";
import worker, { runScheduled } from "../../src/index";
import { getTemplate, listTemplateNames, registerTemplate, unregisterTemplate } from "../../src/templates";
import { setLogSink } from "../../src/log";
import { FakeDb, makeEnv, seedBot } from "../helpers";

afterEach(() => {
  unregisterTemplate("cron1");
  unregisterTemplate("cron2");
  setLogSink(null);
});

describe("template registry", () => {
  it("has forcesub and rejects duplicates", () => {
    expect(getTemplate("forcesub")?.name).toBe("forcesub");
    expect(listTemplateNames()).toContain("forcesub");
    expect(() => registerTemplate(getTemplate("forcesub")!)).toThrow();
    expect(getTemplate("nope")).toBeUndefined();
  });
});

describe("scheduled", () => {
  it("calls every enabled bot's template; one failure does not stop the rest; disabled skipped", async () => {
    const seen: string[] = [];
    registerTemplate({
      name: "cron1",
      parseConfig: (r) => r,
      install() {},
      async scheduled(_env, d) {
        seen.push(d.botId);
        if (d.botId === "bad") throw new Error("x");
      },
    });
    registerTemplate({ name: "cron2", parseConfig: (r) => r, install() {} }); // no scheduled()
    const db = new FakeDb();
    await seedBot(db, { id: "bad", template: "cron1", config: {} });
    await seedBot(db, { id: "good", template: "cron1", config: {} });
    await seedBot(db, { id: "off", template: "cron1", config: {}, enabled: 0 });
    await seedBot(db, { id: "plain", template: "cron2", config: {} });
    await seedBot(db, { id: "fs" }); // forcesub: no scheduled
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const r = await runScheduled(makeEnv(), { db });
    expect(seen).toEqual(["bad", "good"]);
    expect(r).toEqual({ ran: 1, failed: 1 });
    expect(lines.some((l) => l.includes("scheduled failed"))).toBe(true);
  });

  it("worker.scheduled is exported and tolerates an invalid env", async () => {
    expect(typeof worker.scheduled).toBe("function");
    await expect(
      worker.scheduled({} as ScheduledController, makeEnv(), { waitUntil() {} } as unknown as ExecutionContext),
    ).resolves.toBeUndefined();
  });
});
