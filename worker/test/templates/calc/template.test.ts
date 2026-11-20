import { afterEach, describe, expect, it } from "vitest";
import { runScheduled } from "../../../src/index";
import { LANGS, COMMAND_NAMES, DICTIONARIES } from "../../../src/i18n";
import { loadRates } from "../../../src/fx/store";
import { setLogSink } from "../../../src/log";
import { getTemplate, listTemplateNames } from "../../../src/templates";
import { FX_REFRESH_AFTER_S, buildProfile, calcTemplate, refreshRates } from "../../../src/templates/calc";
import { parseCalcConfig } from "../../../src/templates/calc/config";
import { getRatesCached, invalidateRates } from "../../../src/templates/calc/memory";
import { handleWebhook } from "../../../src/webhook";
import { createPlatformState } from "../../../src/ratelimit";
import { APP_CONFIG, CBU_BODY, CalcFakeDb, NOW, fakeFetch, seedRates, text } from "./util";
import { ADMIN, makeEnv, post, seedBot } from "../../helpers";

afterEach(() => setLogSink(null));

const CBU = "https://cbu.uz/oz/arkhiv-kursov-valyut/json/";

function deps(db: CalcFakeDb, fetchFn: typeof fetch, now = NOW) {
  return { botId: "b1", config: parseCalcConfig({}), db, appConfig: APP_CONFIG, now: () => now, fetchFn };
}

describe("registry", () => {
  it("calc is registered next to forcesub", () => {
    expect(getTemplate("calc")).toBe(calcTemplate);
    expect(listTemplateNames()).toEqual(expect.arrayContaining(["forcesub", "calc"]));
  });

  it("rateLimit is false (the handlers apply ctx.rateLimited themselves)", () => {
    expect(calcTemplate.rateLimit).toBe(false);
  });

  it("parseConfig validates", () => {
    expect(calcTemplate.parseConfig({ proStars: 50 })).toMatchObject({ proStars: 50, miniAppPath: "/app/" });
    expect(() => calcTemplate.parseConfig({ proStars: 0 })).toThrow();
  });
});

describe("profile", () => {
  const p = buildProfile(parseCalcConfig({}));

  it("registers default plus 6 Telegram languages (uz-cyrl is served by uz)", () => {
    const codes = Object.keys(p.commands).sort();
    expect(codes).toEqual(["ar", "default", "en", "es", "ru", "tr", "uz"]);
    for (const set of [p.names, p.shortDescriptions, p.descriptions]) expect(Object.keys(set).sort()).toEqual(codes);
  });

  it("all 19 commands in every language, valid for setMyCommands", () => {
    expect(COMMAND_NAMES).toHaveLength(19);
    for (const [lang, list] of Object.entries(p.commands)) {
      expect(list.map((c) => c.command), lang).toEqual([...COMMAND_NAMES]);
      for (const c of list) {
        expect(c.command).toMatch(/^[a-z0-9_]{1,32}$/);
        expect(c.description.length).toBeGreaterThanOrEqual(3);
        expect(c.description.length).toBeLessThanOrEqual(256);
      }
    }
  });

  it("texts respect Telegram limits", () => {
    for (const lang of Object.keys(p.names)) {
      expect(p.names[lang].length).toBeLessThanOrEqual(64);
      expect(p.shortDescriptions[lang].length).toBeLessThanOrEqual(120);
      expect(p.descriptions[lang].length).toBeLessThanOrEqual(512);
    }
  });

  it.each(LANGS.filter((l) => l !== "uz-cyrl"))("%s texts come from the dictionary", (lang) => {
    const code = lang === "uz-latn" ? "uz" : lang;
    expect(p.names[code]).toBe(DICTIONARIES[lang].bot_name);
    expect(p.commands[code][0].description).toBe(DICTIONARIES[lang].cmd_start);
  });

  it("default = English", () => {
    expect(p.names.default).toBe(DICTIONARIES.en.bot_name);
    expect(p.commands.default).toEqual(p.commands.en);
  });

  it("menu button points at the configured Mini App path", () => {
    expect(p.menuButton).toEqual({ text: DICTIONARIES.en.mini_open, path: "/app/" });
    expect(buildProfile(parseCalcConfig({ miniAppPath: "/x/" })).menuButton.path).toBe("/x/");
  });

  it("calcTemplate.profile is buildProfile", () => {
    expect(calcTemplate.profile!(parseCalcConfig({}))).toEqual(p);
  });
});

describe("scheduled: FX refresh", () => {
  it("empty table: fetches CBU and stores UZS-based rates", async () => {
    const db = new CalcFakeDb();
    const f = fakeFetch(() => CBU_BODY);
    expect(await refreshRates(deps(db, f.fn))).toBe("updated");
    expect(f.urls).toEqual([CBU]);
    const rates = await loadRates(db);
    expect(rates?.base).toBe("UZS");
    expect(rates?.updatedAt).toBe(NOW);
    expect(Object.keys(rates!.rates)).toEqual(expect.arrayContaining(["USD", "EUR", "UZS"]));
  });

  it("a table younger than 12 hours is not refreshed (no request at all)", async () => {
    const db = new CalcFakeDb();
    seedRates(db, NOW - FX_REFRESH_AFTER_S + 60);
    invalidateRates(db);
    const f = fakeFetch(() => CBU_BODY);
    expect(await refreshRates(deps(db, f.fn))).toBe("fresh");
    expect(f.urls).toHaveLength(0);
  });

  it("an older table is refreshed", async () => {
    const db = new CalcFakeDb();
    seedRates(db, NOW - FX_REFRESH_AFTER_S - 60);
    invalidateRates(db);
    const f = fakeFetch(() => CBU_BODY);
    expect(await refreshRates(deps(db, f.fn))).toBe("updated");
    expect((await loadRates(db))?.updatedAt).toBe(NOW);
  });

  it("refreshing makes new conversions use the new numbers (cache invalidated)", async () => {
    const db = new CalcFakeDb();
    seedRates(db, NOW - 20 * 3600);
    invalidateRates(db);
    const before = await getRatesCached(db, NOW);
    await refreshRates(deps(db, fakeFetch(() => CBU_BODY).fn));
    const after = await getRatesCached(db, NOW);
    expect(after?.updatedAt).toBe(NOW);
    expect(before?.updatedAt).not.toBe(after?.updatedAt);
  });

  it("source failure: the old table stays and a warning is logged", async () => {
    const lines: string[] = [];
    setLogSink((_l, line) => lines.push(line));
    const db = new CalcFakeDb();
    seedRates(db, NOW - 3 * 86_400);
    invalidateRates(db);
    const f = fakeFetch(() => {
      throw new Error("network down");
    });
    expect(await refreshRates(deps(db, f.fn))).toBe("failed");
    expect((await loadRates(db))?.updatedAt).toBe(NOW - 3 * 86_400);
    expect(lines.some((l) => l.includes("FX refresh failed") && l.includes('"level":"warn"'))).toBe(true);
  });

  it("falls back to the second source when CBU fails", async () => {
    const db = new CalcFakeDb();
    const f = fakeFetch((url) => {
      if (url.includes("cbu.uz")) return new Response("nope", { status: 500 });
      return { result: "success", base_code: "USD", rates: { USD: 1, UZS: 12000, EUR: 0.9, RUB: 80, KZT: 500 } };
    });
    expect(await refreshRates(deps(db, f.fn))).toBe("updated");
    expect((await loadRates(db))?.base).toBe("USD");
    expect(f.urls).toHaveLength(2);
  });

  it("garbage from both sources keeps the table untouched", async () => {
    setLogSink(() => {});
    const db = new CalcFakeDb();
    seedRates(db, NOW - 3 * 86_400);
    invalidateRates(db);
    const before = [...db.fx.values()].map((r) => r.rate).join();
    expect(await refreshRates(deps(db, fakeFetch(() => ({ hello: "world" })).fn))).toBe("failed");
    expect([...db.fx.values()].map((r) => r.rate).join()).toBe(before);
  });

  it("a storage failure is reported as failed and does not throw", async () => {
    setLogSink(() => {});
    const db = new CalcFakeDb();
    db.failSql = /INSERT OR REPLACE INTO fx_rates/;
    expect(await refreshRates(deps(db, fakeFetch(() => CBU_BODY).fn))).toBe("failed");
  });

  it("an unreadable table still triggers a fetch", async () => {
    setLogSink(() => {});
    const db = new CalcFakeDb();
    db.failSql = /SELECT base, quote/;
    invalidateRates(db);
    const f = fakeFetch(() => CBU_BODY);
    await refreshRates(deps(db, f.fn));
    expect(f.urls).toHaveLength(1);
  });

  it("calcTemplate.scheduled never throws on failure", async () => {
    setLogSink(() => {});
    const db = new CalcFakeDb();
    const f = fakeFetch(() => {
      throw new Error("down");
    });
    await expect(calcTemplate.scheduled!(makeEnv(), deps(db, f.fn))).resolves.toBeUndefined();
  });

  it("runScheduled calls the calc template of an enabled calc bot", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "calc1", template: "calc", config: {} });
    const f = fakeFetch(() => CBU_BODY);
    const r = await runScheduled(makeEnv(), { db, fetchFn: f.fn, now: () => NOW, appConfig: APP_CONFIG });
    expect(r).toEqual({ ran: 1, failed: 0 });
    expect(f.urls).toEqual([CBU]);
    expect(db.fx.size).toBeGreaterThan(4);
  });

  it("two calc bots fetch only once per refresh window", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "calc1", template: "calc", config: {} });
    await seedBot(db, { id: "calc2", template: "calc", config: {} });
    const f = fakeFetch(() => CBU_BODY);
    const r = await runScheduled(makeEnv(), { db, fetchFn: f.fn, now: () => NOW, appConfig: APP_CONFIG });
    expect(r.ran).toBe(2);
    expect(f.urls).toHaveLength(1);
  });

  it("a disabled calc bot is not scheduled", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "calc1", template: "calc", config: {}, enabled: 0 });
    const f = fakeFetch(() => CBU_BODY);
    await runScheduled(makeEnv(), { db, fetchFn: f.fn, now: () => NOW, appConfig: APP_CONFIG });
    expect(f.urls).toHaveLength(0);
  });
});

describe("through the webhook (platform integration)", () => {
  const URL = "https://w.test/wh/c1";
  const H = { "x-telegram-bot-api-secret-token": "s3cret" };

  function recorder() {
    const calls: { method: string; payload: Record<string, unknown> }[] = [];
    const configureBot = (bot: import("grammy").Bot) => {
      bot.api.config.use(async (_prev, method, payload) => {
        calls.push({ method, payload: payload as Record<string, unknown> });
        return { ok: true, result: true } as never;
      });
    };
    return { calls, configureBot };
  }

  it("a calc bot answers a message end to end", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: {} });
    const rec = recorder();
    const res = await handleWebhook(post(URL, { update_id: 1, ...text("2+2") }, H), makeEnv(), "c1", { db, configureBot: rec.configureBot, appConfig: APP_CONFIG });
    expect(res.status).toBe(200);
    expect(rec.calls.find((c) => c.method === "sendMessage")?.payload.text).toBe("<code>2+2</code> = <code>4</code>");
  });

  it("the platform limiter is bypassed (rateLimit:false) but ctx.rateLimited still protects plain messages", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: {} });
    const rec = recorder();
    const platform = createPlatformState({ limiter: { capacity: 2, windowMs: 60_000 } });
    let sent = 0;
    for (let i = 1; i <= 5; i++) {
      await handleWebhook(post(URL, { update_id: i, ...text(`${i}+1`) }, H), makeEnv(), "c1", { db, configureBot: rec.configureBot, platform, appConfig: APP_CONFIG });
      sent = rec.calls.filter((c) => c.method === "sendMessage").length;
    }
    // bucket of 2: first two are computed, the others get the short rate_limited reply (still one message each)
    const texts = rec.calls.filter((c) => c.method === "sendMessage").map((c) => String(c.payload.text));
    expect(sent).toBe(5);
    expect(texts.filter((t) => t.includes("Too many requests"))).toHaveLength(3);
  });

  it("payments are never rate limited, even with an exhausted bucket", async () => {
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: {} });
    const rec = recorder();
    const platform = createPlatformState({ limiter: { capacity: 1, windowMs: 3_600_000 } });
    for (let i = 1; i <= 3; i++) {
      await handleWebhook(post(URL, { update_id: i, ...text("1+1") }, H), makeEnv(), "c1", { db, configureBot: rec.configureBot, platform, appConfig: APP_CONFIG });
    }
    rec.calls.length = 0;
    await handleWebhook(
      post(
        URL,
        {
          update_id: 99,
          pre_checkout_query: { id: "pq", from: { id: 5, is_bot: false, first_name: "A" }, currency: "XTR", total_amount: 150, invoice_payload: "pro:c1:5:v1" },
        },
        H,
      ),
      makeEnv(),
      "c1",
      { db, configureBot: rec.configureBot, platform, appConfig: APP_CONFIG },
    );
    expect(rec.calls.some((c) => c.method === "answerPreCheckoutQuery")).toBe(true);
  });

  it("an invalid stored config never reaches Telegram (webhook answers 200)", async () => {
    setLogSink(() => {});
    const db = new CalcFakeDb();
    await seedBot(db, { id: "c1", template: "calc", config: { proStars: 0 } });
    const rec = recorder();
    const res = await handleWebhook(post(URL, { update_id: 1, ...text("2+2") }, H), makeEnv(), "c1", { db, configureBot: rec.configureBot, appConfig: APP_CONFIG });
    expect(res.status).toBe(200);
    expect(rec.calls).toHaveLength(0);
  });

  it("admin can register a calc bot with a config and see it listed", async () => {
    const { handleAdmin } = await import("../../../src/admin");
    const db = new CalcFakeDb();
    const fetchFn = (async (url: string) => {
      if (url.endsWith("/getMe")) return new Response(JSON.stringify({ ok: true, result: { id: 1, is_bot: true, username: "tezcalc_bot" } }));
      return new Response(JSON.stringify({ ok: true, result: true }));
    }) as unknown as typeof fetch;
    const res = await handleAdmin(
      post("https://w.test/admin/bots", { id: "c1", token: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ012345", template: "calc", config: { proStars: 120 } }, { authorization: `Bearer ${ADMIN}` }),
      makeEnv(),
      { db, fetchFn },
    );
    expect(res.status).toBe(201);
    expect(JSON.parse(String(db.bots.get("c1")!.config))).toEqual({ proStars: 120, miniAppPath: "/app/" });
  });
});
