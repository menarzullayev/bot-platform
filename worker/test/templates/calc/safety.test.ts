import { afterEach, describe, expect, it } from "vitest";
import { setLogSink } from "../../../src/log";
import { CalcFakeDb, guest, harness, inline, makePro, seedRates, text } from "./util";

afterEach(() => setLogSink(null));

const HOSTILE = [
  "<script>alert(1)</script>",
  "2 < 3 && 4 > 1",
  "```2+2```",
  "&amp; &lt;b&gt;",
  "1 + <b>2</b>",
  "<a href=\"javascript:alert(1)\">x</a>",
  "5 <i>km</i> to mi",
  "\u0000\u0001 2+2",
  "💥💥💥",
  "a".repeat(300),
  "(((((((((((((((((((((((((((((((((((((((",
  "5 USD to <EUR>",
];

const ALLOWED_TAGS = new Set(["b", "i", "code", "pre", "a", "u", "s"]);

/** Every string the bot sends to Telegram as HTML must be balanced and must not contain raw user markup. */
function assertSafeHtml(htmlText: string, hostile: string): void {
  const stack: string[] = [];
  for (const m of htmlText.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g)) {
    const name = m[2].toLowerCase();
    expect(ALLOWED_TAGS.has(name), `tag <${name}> in ${JSON.stringify(htmlText)}`).toBe(true);
    if (m[1]) expect(stack.pop()).toBe(name);
    else stack.push(name);
  }
  expect(stack).toEqual([]);
  const plain = htmlText.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  expect(plain).not.toMatch(/[<>]/);
  expect(plain.replace(/&(?:lt|gt|amp|quot);/g, "")).not.toMatch(/&/);
  expect(htmlText.length).toBeLessThanOrEqual(4096);
  void hostile;
}

describe("hostile input never produces unsafe HTML", () => {
  it.each(HOSTILE)("private message %j", async (input) => {
    const h = harness();
    seedRates(h.db);
    await h.send(text(input));
    for (const c of h.sent("sendMessage")) {
      if (c.payload.parse_mode === "HTML") assertSafeHtml(String(c.payload.text), input);
    }
    expect(h.calls.every((c) => c.method === "sendMessage")).toBe(true);
  });

  it.each(HOSTILE)("inline query %j", async (input) => {
    const h = harness();
    await h.send(inline(input.slice(0, 256)));
    const answers = h.sent("answerInlineQuery");
    expect(answers).toHaveLength(1);
    for (const r of answers[0].payload.results as { title: string; input_message_content: { message_text: string; parse_mode?: string } }[]) {
      expect(r.title).not.toMatch(/<script/i);
      if (r.input_message_content.parse_mode === "HTML") assertSafeHtml(r.input_message_content.message_text, input);
    }
  });

  it.each(HOSTILE)("guest message %j", async (input) => {
    const h = harness();
    await h.send(guest(`@tezcalc_bot ${input}`));
    const answers = h.sent("answerGuestQuery");
    expect(answers).toHaveLength(1);
    const c = (answers[0].payload.result as { input_message_content: { message_text: string; parse_mode?: string } }).input_message_content;
    if (c.parse_mode === "HTML") assertSafeHtml(c.message_text, input);
  });

  it.each(HOSTILE.slice(0, 6))("Pro commands %j", async (input) => {
    const h = harness();
    makePro(h.db);
    for (const cmd of ["solve", "derive", "integrate"]) await h.send(text(`/${cmd} ${input}`));
    for (const c of h.sent("sendMessage")) assertSafeHtml(String(c.payload.text), input);
  });

  it.each(HOSTILE.slice(0, 6))("/convert, /loan, /vat %j", async (input) => {
    const h = harness();
    for (const cmd of ["convert", "loan", "vat"]) await h.send(text(`/${cmd} ${input}`));
    for (const c of h.sent("sendMessage")) assertSafeHtml(String(c.payload.text), input);
  });

  it("a stored first name with markup is escaped in /start", async () => {
    const h = harness();
    const m = text("/start");
    (m.message.from as { first_name: string }).first_name = "<img src=x onerror=1>&";
    await h.send(m);
    const sent = String(h.sent("sendMessage")[0].payload.text);
    expect(sent).not.toContain("<img");
    expect(sent).toContain("&lt;img src=x onerror=1&gt;&amp;");
  });

  it("a bot username-like hostile mention in a group is harmless", async () => {
    const h = harness();
    await h.send(text("@tezcalc_bot <script>", { type: "group" }));
    for (const c of h.sent("sendMessage")) assertSafeHtml(String(c.payload.text), "");
  });

  it("unknown commands with markup are answered with a fixed text", async () => {
    const h = harness();
    await h.send(text("/<script>"));
    for (const c of h.sent("sendMessage")) expect(String(c.payload.text)).not.toContain("<script>");
  });

  it("fresh database objects do not share state between harnesses", () => {
    const a = new CalcFakeDb();
    const b = new CalcFakeDb();
    a.history.push({ id: 1, bot_id: "b", user_id: 1, expr: "x", result: "y", ts: 1 });
    expect(b.history).toHaveLength(0);
  });
});
