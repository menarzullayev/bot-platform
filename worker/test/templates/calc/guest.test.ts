import { afterEach, describe, expect, it } from "vitest";
import { DICTIONARIES } from "../../../src/i18n";
import { en } from "../../../src/i18n/en";
import { setLogSink } from "../../../src/log";
import { guest, harness, seedRates, setUser, widgetQuery } from "./util";

afterEach(() => setLogSink(null));

interface Article {
  type: string;
  id: string;
  title: string;
  input_message_content: { message_text: string; parse_mode?: string };
}

const answers = (h: ReturnType<typeof harness>) => h.sent("answerGuestQuery");

describe("guest mode", () => {
  it("answers exactly once, with the full answer in one article", async () => {
    const h = harness();
    await h.send(guest("@tezcalc_bot 12*3+4"));
    expect(answers(h)).toHaveLength(1);
    const p = answers(h)[0].payload;
    expect(p.guest_query_id).toBe("gq1");
    const r = p.result as Article;
    expect(r.type).toBe("article");
    expect(r.input_message_content.message_text).toBe("<code>12*3+4</code> = <code>40</code>");
    expect(r.input_message_content.parse_mode).toBe("HTML");
    expect(h.calls.filter((c) => c.method !== "answerGuestQuery")).toHaveLength(0);
  });

  it("strips the mention wherever it is, case-insensitively", async () => {
    const h = harness();
    await h.send(guest("100 km to mi @TezCalc_Bot"));
    expect((answers(h)[0].payload.result as Article).input_message_content.message_text).toContain("<code>100 km</code>");
  });

  it("includes the alternative renderings in the same message", async () => {
    const h = harness();
    await h.send(guest("@tezcalc_bot 10/3"));
    const text = (answers(h)[0].payload.result as Article).input_message_content.message_text;
    expect(text).toContain("<code>3.33333333333</code>");
    expect(text).toContain("≈ <code>3.33</code>");
    expect(answers(h)).toHaveLength(1);
  });

  it("errors are answered once, localized", async () => {
    const h = harness();
    setUser(h.db, 5, { lang: "ru" });
    await h.send(guest("@tezcalc_bot 1/0"));
    expect(answers(h)).toHaveLength(1);
    expect((answers(h)[0].payload.result as Article).input_message_content.message_text).toBe(DICTIONARIES.ru.err_div0);
  });

  it("chit-chat or an empty mention gets the plain hint (no parse mode)", async () => {
    const h = harness();
    await h.send(guest("@tezcalc_bot"));
    const r = answers(h)[0].payload.result as Article;
    expect(r.input_message_content.message_text).toBe(en.guest_hint);
    expect(r.input_message_content.parse_mode).toBeUndefined();
    expect(answers(h)).toHaveLength(1);
  });

  it("currency conversions use the stored table", async () => {
    const h = harness();
    seedRates(h.db);
    await h.send(guest("@tezcalc_bot 100 USD to UZS"));
    expect((answers(h)[0].payload.result as Article).input_message_content.message_text).toContain("1,200,000 UZS");
  });

  it("writes nothing: no history, no user row, no bot_users", async () => {
    const h = harness();
    setUser(h.db, 5, { keep_history: 1 });
    h.db.resetCounters();
    await h.send(guest("@tezcalc_bot 2+2"));
    expect(h.db.writes).toBe(0);
    expect(h.db.history).toHaveLength(0);
  });

  it("does not chain `ans` (stateless)", async () => {
    const h = harness();
    await h.send(guest("@tezcalc_bot ans+1"));
    expect((answers(h)[0].payload.result as Article).input_message_content.message_text).toContain("don't know what");
  });

  it("Arabic answers isolate the math", async () => {
    const h = harness();
    await h.send(guest("@tezcalc_bot 2+3", { lang: "ar" }));
    expect((answers(h)[0].payload.result as Article).input_message_content.message_text).toContain("⁦2+3⁩");
  });

  it("rate limited: one short answer, nothing computed", async () => {
    const h = harness({ rateLimited: () => true });
    await h.send(guest("@tezcalc_bot 2+2"));
    expect(answers(h)).toHaveLength(1);
    expect((answers(h)[0].payload.result as Article).input_message_content.message_text).toBe(en.rate_limited);
    expect(h.db.reads).toBe(0);
  });

  it("a Telegram failure is logged and NOT retried (one reply only)", async () => {
    const logs: string[] = [];
    setLogSink((_l, line) => logs.push(line));
    const h = harness({ failMethods: ["answerGuestQuery"] });
    await h.send(guest("@tezcalc_bot 2+2"));
    expect(answers(h)).toHaveLength(1);
    expect(logs.some((l) => l.includes("answerGuestQuery failed"))).toBe(true);
  });

  it("a DB outage still produces the single answer", async () => {
    const h = harness();
    setLogSink(() => {});
    h.db.failSql = /SELECT lang, angle/;
    await h.send(guest("@tezcalc_bot 2+2"));
    expect(answers(h)).toHaveLength(1);
    expect((answers(h)[0].payload.result as Article).input_message_content.message_text).toContain("<code>4</code>");
  });

  it("without guest_query_id nothing can be answered", async () => {
    const logs: string[] = [];
    setLogSink((_l, line) => logs.push(line));
    const h = harness();
    await h.send(guest("@tezcalc_bot 2+2", { queryId: null }));
    expect(h.calls).toHaveLength(0);
    expect(logs.some((l) => l.includes("without guest_query_id"))).toBe(true);
  });

  it("the result id is stable per query and within 64 bytes", async () => {
    const h = harness();
    await h.send(guest("@tezcalc_bot 2+2"));
    const id = (answers(h)[0].payload.result as Article).id;
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("guest updates are not handled as ordinary messages (no sendMessage)", async () => {
    const h = harness();
    await h.send(guest("@tezcalc_bot 2+2"));
    expect(h.sent("sendMessage")).toHaveLength(0);
  });
});

describe("widget_query", () => {
  const answerCalls = (h: ReturnType<typeof harness>) => h.sent("answerWidgetQuery");

  it("sends the result to the user's chat and answers `ok` once", async () => {
    const h = harness();
    await h.send(widgetQuery("s:1234.5"));
    expect(h.texts()).toEqual(["<code>1,234.5</code>"]);
    expect(h.sent("sendMessage")[0].payload.chat_id).toBe(5);
    expect(answerCalls(h)).toHaveLength(1);
    expect(answerCalls(h)[0].payload).toEqual({ widget_query_id: "wq1", data: "ok" });
  });

  it("formats with the user's language", async () => {
    const h = harness();
    setUser(h.db, 5, { lang: "ru" });
    await h.send(widgetQuery("s:1234.5"));
    expect(h.texts()).toEqual(["<code>1 234,5</code>"]);
  });

  it("negative and exponent forms", async () => {
    const h = harness();
    await h.send(widgetQuery("s:-12"));
    await h.send(widgetQuery("s:1.5e-7"));
    expect(h.texts()[0]).toBe("<code>-12</code>");
    expect(h.texts()[1]).toContain("1.5×10^-7");
  });

  it("data that is not ours is answered `err` and sends nothing", async () => {
    const h = harness();
    await h.send(widgetQuery("hello"));
    await h.send(widgetQuery("s:abc"));
    await h.send(widgetQuery(123));
    expect(h.sent("sendMessage")).toHaveLength(0);
    expect(answerCalls(h).map((c) => c.payload.data)).toEqual(["err", "err", "err"]);
  });

  it("is always answered, even when sending the message fails", async () => {
    const logs: string[] = [];
    setLogSink((_l, line) => logs.push(line));
    const h = harness({ failMethods: ["sendMessage"] });
    await h.send(widgetQuery("s:5"));
    expect(answerCalls(h)).toHaveLength(1);
    expect(answerCalls(h)[0].payload.data).toBe("err");
    expect(logs.some((l) => l.includes("widget_query handling failed"))).toBe(true);
  });

  it("rate limited users get `busy`", async () => {
    const h = harness({ rateLimited: () => true });
    await h.send(widgetQuery("s:5"));
    expect(answerCalls(h)[0].payload.data).toBe("busy");
    expect(h.sent("sendMessage")).toHaveLength(0);
  });

  it("accepts widget_query_id as the id field", async () => {
    const h = harness();
    await h.send({ widget_query: { widget_query_id: "alt", from: { id: 5, is_bot: false, first_name: "A" }, data: "s:2" } });
    expect(answerCalls(h)[0].payload.widget_query_id).toBe("alt");
  });

  it("without an id nothing can be answered", async () => {
    const logs: string[] = [];
    setLogSink((_l, line) => logs.push(line));
    const h = harness();
    await h.send(widgetQuery("s:5", { id: null }));
    expect(h.calls).toHaveLength(0);
    expect(logs.some((l) => l.includes("without id"))).toBe(true);
  });

  it("other updates pass through untouched", async () => {
    const h = harness();
    await h.send({ message: { message_id: 1, date: 1, chat: { id: 5, type: "private", first_name: "A" }, from: { id: 5, is_bot: false, first_name: "A", language_code: "en" }, text: "1+1" } });
    expect(h.texts()).toEqual(["<code>1+1</code> = <code>2</code>"]);
    expect(answerCalls(h)).toHaveLength(0);
  });
});
