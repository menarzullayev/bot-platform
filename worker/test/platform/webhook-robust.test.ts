import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleWebhook } from "../../src/webhook";
import { registerTemplate, unregisterTemplate, type Template } from "../../src/templates";
import { createPlatformState } from "../../src/ratelimit";
import { setLogSink } from "../../src/log";
import { FakeDb, makeEnv, post, recorder, seedBot } from "../helpers";

const H = { "x-telegram-bot-api-secret-token": "s3cret" };
const URL = "https://w.test/wh/b1";

const upd = (id: number, uid = 5) => ({
  update_id: id,
  message: {
    message_id: id,
    date: 1,
    chat: { id: uid, type: "private", first_name: "A" },
    from: { id: uid, is_bot: false, first_name: "A" },
    text: "hi",
  },
});

let handled: number[] = [];
let exempt = false;
const fake: Template<{ n: number }> = {
  name: "fake",
  parseConfig: (raw) => ({ n: Number((raw as { n?: number })?.n ?? 0) }),
  install(bot) {
    bot.on("message", async (c) => {
      handled.push(c.update.update_id);
      if (c.message.text === "boom") throw new Error("kaboom 123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ012345");
      await c.reply("pong");
    });
  },
  get rateLimit() {
    return exempt ? (false as const) : undefined;
  },
};

const logs: string[] = [];
beforeEach(() => {
  handled = [];
  exempt = false;
  logs.length = 0;
  setLogSink((_l, line) => logs.push(line));
  registerTemplate(fake);
});
afterEach(() => {
  unregisterTemplate("fake");
  setLogSink(null);
});

async function setup() {
  const db = new FakeDb();
  await seedBot(db, { template: "fake", config: { n: 1 } });
  return { db, rec: recorder("member") };
}

describe("webhook robustness", () => {
  it("registry-installed template handles updates", async () => {
    const { db, rec } = await setup();
    const res = await handleWebhook(post(URL, upd(1), H), makeEnv(), "b1", { db, configureBot: rec.configureBot });
    expect(res.status).toBe(200);
    expect(handled).toEqual([1]);
  });

  it("handler error: 200, logged, token not logged", async () => {
    const { db, rec } = await setup();
    const u = upd(1);
    u.message.text = "boom";
    const res = await handleWebhook(post(URL, u, H), makeEnv(), "b1", { db, configureBot: rec.configureBot });
    expect(res.status).toBe(200);
    const all = logs.join("\n");
    expect(all).toContain("webhook failed");
    expect(all).toContain("kaboom");
    expect(all).not.toContain("ABCDEFGH");
  });

  it("internal failure (DB throws): 200", async () => {
    const db = new FakeDb();
    db.prepare = () => {
      throw new Error("d1 down");
    };
    const res = await handleWebhook(post(URL, upd(1), H), makeEnv(), "b1", { db });
    expect(res.status).toBe(200);
    expect(logs.join("\n")).toContain("webhook failed");
  });

  it("broken stored config: 200", async () => {
    const db = new FakeDb();
    await seedBot(db, { template: "fake" });
    db.bots.get("b1")!.config = "{not json";
    const res = await handleWebhook(post(URL, upd(1), H), makeEnv(), "b1", { db });
    expect(res.status).toBe(200);
  });

  it("unknown template and garbage body: 200", async () => {
    const db = new FakeDb();
    await seedBot(db, { template: "nope" });
    expect((await handleWebhook(post(URL, upd(1), H), makeEnv(), "b1", { db })).status).toBe(200);
    const { db: db2 } = await setup();
    const bad = new Request(URL, { method: "POST", headers: H, body: "not json" });
    expect((await handleWebhook(bad, makeEnv(), "b1", { db: db2 })).status).toBe(200);
  });

  it("401 and 404 stay", async () => {
    const { db } = await setup();
    expect((await handleWebhook(post(URL, upd(1), {}), makeEnv(), "b1", { db })).status).toBe(401);
    expect((await handleWebhook(post(URL, upd(1), H), makeEnv(), "zzz", { db })).status).toBe(404);
  });

  it("duplicate update_id is skipped, per bot", async () => {
    const { db, rec } = await setup();
    const deps = { db, configureBot: rec.configureBot };
    await handleWebhook(post(URL, upd(7), H), makeEnv(), "b1", deps);
    const res = await handleWebhook(post(URL, upd(7), H), makeEnv(), "b1", deps);
    expect(res.status).toBe(200);
    expect(handled).toEqual([7]);
    await handleWebhook(post(URL, upd(8), H), makeEnv(), "b1", deps);
    expect(handled).toEqual([7, 8]);
  });

  it("per-user rate limit: over the limit the handler is not called, still 200", async () => {
    const { db, rec } = await setup();
    const platform = createPlatformState({ limiter: { capacity: 2, windowMs: 10_000 } });
    const deps = { db, configureBot: rec.configureBot, platform, nowMs: () => 0 };
    for (let i = 1; i <= 4; i++) {
      const res = await handleWebhook(post(URL, upd(i), H), makeEnv(), "b1", deps);
      expect(res.status).toBe(200);
    }
    expect(handled).toEqual([1, 2]);
    // another user is unaffected
    await handleWebhook(post(URL, upd(5, 99), H), makeEnv(), "b1", deps);
    expect(handled).toEqual([1, 2, 5]);
  });

  it("template with rateLimit:false is exempt from the platform limit", async () => {
    exempt = true;
    const { db, rec } = await setup();
    const platform = createPlatformState({ limiter: { capacity: 1, windowMs: 10_000 } });
    const deps = { db, configureBot: rec.configureBot, platform, nowMs: () => 0 };
    for (let i = 1; i <= 3; i++) await handleWebhook(post(URL, upd(i), H), makeEnv(), "b1", deps);
    expect(handled).toEqual([1, 2, 3]);
  });

  it("ctx.rateLimited shares the bucket key botId:userId", async () => {
    exempt = true;
    const calls: boolean[] = [];
    unregisterTemplate("fake");
    registerTemplate<{ n: number }>({
      ...fake,
      rateLimit: false,
      install(bot, ctx) {
        bot.on("message", () => {
          calls.push(ctx.rateLimited(5));
        });
      },
    });
    const { db, rec } = await setup();
    const platform = createPlatformState({ limiter: { capacity: 1, windowMs: 10_000 } });
    const deps = { db, configureBot: rec.configureBot, platform, nowMs: () => 0 };
    await handleWebhook(post(URL, upd(1), H), makeEnv(), "b1", deps);
    await handleWebhook(post(URL, upd(2), H), makeEnv(), "b1", deps);
    expect(calls).toEqual([false, true]);
  });

  it("disabled bot (kill-switch): 200, no handler", async () => {
    const db = new FakeDb();
    await seedBot(db, { template: "fake", enabled: 0 });
    const res = await handleWebhook(post(URL, upd(1), H), makeEnv(), "b1", { db });
    expect(res.status).toBe(200);
    expect(handled).toEqual([]);
  });
});
