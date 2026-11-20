import { afterEach, describe, expect, it } from "vitest";
import { DICTIONARIES } from "../../../src/i18n";
import { en } from "../../../src/i18n/en";
import { setLogSink } from "../../../src/log";
import { stableId } from "../../../src/templates/calc/inline";
import { harness, inline, seedRates, setUser } from "./util";

afterEach(() => setLogSink(null));

interface Article {
  type: string;
  id: string;
  title: string;
  description?: string;
  input_message_content: { message_text: string; parse_mode?: string };
}

async function ask(h: ReturnType<typeof harness>, query: string, o: { lang?: string; from?: number } = {}) {
  h.calls.length = 0;
  await h.send(inline(query, o));
  const calls = h.sent("answerInlineQuery");
  expect(calls).toHaveLength(1);
  const p = calls[0].payload;
  return { p, results: p.results as Article[] };
}

describe("inline: empty query", () => {
  it("one help result with the Mini App button", async () => {
    const h = harness();
    const { p, results } = await ask(h, "");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe(en.inline_help_title);
    expect(results[0].description).toBe(en.inline_help_desc);
    expect(results[0].input_message_content.message_text).toBe(en.guest_hint);
    expect(p.inline_query_id).toBe("iq1");
    expect(p.button).toEqual({ text: en.mini_open, web_app: { url: "https://calc.test/app/?b=b1" } });
  });

  it("whitespace counts as empty", async () => {
    const { results } = await ask(harness(), "   ");
    expect(results[0].id).toBe("help");
  });

  it("no button without PUBLIC_BASE_URL", async () => {
    const { p } = await ask(harness({ appConfig: { publicBaseUrl: null } }), "");
    expect(p.button).toBeUndefined();
  });

  it("is localized", async () => {
    const { results } = await ask(harness(), "", { lang: "ru" });
    expect(results[0].title).toBe(DICTIONARIES.ru.inline_help_title);
  });
});

describe("inline: calculations", () => {
  it("main result is first, message is HTML `expr = result`", async () => {
    const { results } = await ask(harness(), "12*(3+4)");
    expect(results[0].title).toBe("84");
    expect(results[0].type).toBe("article");
    expect(results[0].input_message_content).toMatchObject({
      message_text: "<code>12*(3+4)</code> = <code>84</code>",
      parse_mode: "HTML",
    });
    expect(results[0].description).toContain("12*(3+4)");
  });

  it("1 result for an integer", async () => {
    expect((await ask(harness(), "2+2")).results).toHaveLength(1);
  });

  it("a fraction gets a rounded second result (2 decimals)", async () => {
    const { results } = await ask(harness(), "10/3");
    expect(results.map((r) => r.title)).toEqual(["3.33333333333", "3.33"]);
  });

  it("a huge value gets a scientific third result", async () => {
    const { results } = await ask(harness(), "123456.789 * 1000000");
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.at(-1)!.title).toContain("×10^");
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("never more than 3 results and ids are unique, <= 64 bytes", async () => {
    const { results } = await ask(harness(), "1234567.891234 * 98765432");
    expect(results.length).toBeLessThanOrEqual(3);
    expect(new Set(results.map((r) => r.id)).size).toBe(results.length);
    for (const r of results) expect(new TextEncoder().encode(r.id).length).toBeLessThanOrEqual(64);
  });

  it("ids are stable for the same query and differ between queries", async () => {
    const a = (await ask(harness(), "2+2")).results[0].id;
    const b = (await ask(harness(), "2+2")).results[0].id;
    const c = (await ask(harness(), "2+3")).results[0].id;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("cache_time 60, is_personal true", async () => {
    const { p } = await ask(harness(), "2+2");
    expect(p.cache_time).toBe(60);
    expect(p.is_personal).toBe(true);
  });

  it("uses the user's angle and digits settings", async () => {
    const h = harness();
    setUser(h.db, 5, { angle: "rad", digits: 6 });
    const { results } = await ask(h, "cos(pi)");
    expect(results[0].title).toBe("-1");
    const r2 = await ask(h, "1/3");
    expect(r2.results[0].title).toBe("0.333333");
  });

  it("does not use `ans` (inline is stateless)", async () => {
    const h = harness();
    const { results } = await ask(h, "ans+1");
    expect(results[0].id.startsWith("err-")).toBe(true);
  });

  it("does not write to D1 and reads once", async () => {
    const h = harness();
    h.db.resetCounters();
    await ask(h, "2+2");
    expect([h.db.reads, h.db.writes]).toEqual([1, 0]);
  });

  it("uz-cyrl users get Cyrillic text and a comma decimal separator", async () => {
    const h = harness();
    setUser(h.db, 5, { lang: "uz-cyrl" });
    const { results } = await ask(h, "10/4");
    expect(results[0].title).toBe("2,5");
    expect(results[0].description).toContain(DICTIONARIES["uz-cyrl"].inline_result_desc);
    expect(results[0].description).toMatch(/[Ѐ-ӿ]/);
  });

  it("Arabic results are isolated for RTL", async () => {
    const { results } = await ask(harness(), "2+3", { lang: "ar" });
    expect(results[0].title).toBe("⁦5⁩");
    expect(results[0].input_message_content.message_text).toContain("⁦2+3⁩");
  });

  it("the plain-text variant of the title has no HTML", async () => {
    const { results } = await ask(harness(), "2+2");
    expect(results[0].title).not.toMatch(/[<>]/);
  });
});

describe("inline: conversions", () => {
  it("units", async () => {
    const { results } = await ask(harness(), "100 km to mi");
    expect(results[0].title).toMatch(/^62\.13\d* mi$/);
    expect(results[0].input_message_content.message_text).toContain("<code>100 km</code>");
  });

  it("currency with rates", async () => {
    const h = harness();
    seedRates(h.db);
    const { results } = await ask(h, "100 USD to UZS");
    expect(results[0].title).toBe("1,200,000 UZS");
    expect(results[0].input_message_content.message_text).toContain("💱");
  });

  it("stale rates carry the warning into the message", async () => {
    const h = harness();
    seedRates(h.db, 1_000);
    const { results } = await ask(h, "100 USD to UZS");
    expect(results[0].input_message_content.message_text).toContain("out of date");
  });

  it("missing rates are a single error result", async () => {
    const { results } = await ask(harness(), "100 USD to UZS");
    expect(results).toHaveLength(1);
    expect(results[0].id.startsWith("err-")).toBe(true);
    expect(results[0].title).toContain("No exchange rate");
  });
});

describe("inline: errors always get an answer", () => {
  it.each([
    ["1/0", "err_div0"],
    ["sqrt(-1)", "err_domain"],
    ["2+*3", "err_syntax"],
    ["5 kg to km", "err_units_mismatch"],
  ] as const)("%s -> one %s result", async (q, key) => {
    const { results } = await ask(harness(), q);
    expect(results).toHaveLength(1);
    expect(results[0].id.startsWith("err-")).toBe(true);
    expect(results[0].title.length).toBeGreaterThan(5);
    expect(results[0].title).not.toContain("⚠️");
    expect(results[0].input_message_content.message_text).toContain(DICTIONARIES.en[key].split("{")[0].slice(0, 15));
  });

  it("error text is localized and an Arabic error needs no HTML escaping", async () => {
    const { results } = await ask(harness(), "1/0", { lang: "ar" });
    expect(results[0].input_message_content.message_text).toBe(DICTIONARIES.ar.err_div0);
  });

  it("chit-chat shows the help result", async () => {
    const { results } = await ask(harness(), "salom dunyo");
    expect(results[0].id).toBe("help");
  });

  it("a rate-limited user gets a short answer, nothing is computed", async () => {
    const h = harness({ rateLimited: () => true });
    const { p, results } = await ask(h, "2+2");
    expect(results[0].title).toBe(en.rate_limited);
    expect(p.cache_time).toBe(5);
    expect(h.db.reads).toBe(0);
  });

  it("a DB outage degrades to defaults and still answers", async () => {
    const h = harness();
    setLogSink(() => {});
    h.db.failSql = /SELECT lang, angle/;
    const { results } = await ask(h, "2+2");
    expect(results[0].title).toBe("4");
  });

  it("if the first answer fails, a fallback error result is attempted", async () => {
    const logs: string[] = [];
    setLogSink((_l, line) => logs.push(line));
    let n = 0;
    const h = harness();
    h.bot.api.config.use(async (prev, method, payload, signal) => {
      if (method === "answerInlineQuery" && n++ === 0) throw new Error("first fails");
      return prev(method, payload, signal);
    });
    await h.send(inline("2+2"));
    expect(h.sent("answerInlineQuery").length).toBeGreaterThanOrEqual(1);
    expect(logs.some((l) => l.includes("inline query failed"))).toBe(true);
  });

  it("a query of the maximum length (256) is handled", async () => {
    const { results } = await ask(harness(), "1+".repeat(127) + "1");
    expect(results).toHaveLength(1);
  });

  it("a very long description is truncated", async () => {
    const { results } = await ask(harness(), "1+".repeat(127) + "1");
    expect(results[0].description!.length).toBeLessThan(200);
  });
});

describe("stableId", () => {
  it("16 hex chars, deterministic", () => {
    expect(stableId("a")).toMatch(/^[0-9a-f]{16}$/);
    expect(stableId("a")).toBe(stableId("a"));
    expect(stableId("a")).not.toBe(stableId("b"));
  });
});
