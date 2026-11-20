import { describe, expect, it } from "vitest";
import { handleWebhook } from "../src/webhook";
import { parseForceSubConfig } from "../src/templates/forcesub";
import { FakeDb, chkUpdate, makeEnv, post, recorder, seedBot, startUpdate } from "./helpers";

const URL = "https://w.test/wh/b1";
const H = { "x-telegram-bot-api-secret-token": "s3cret" };

describe("webhook", () => {
  it("noma'lum bot: 404", async () => {
    const db = new FakeDb();
    const res = await handleWebhook(post(URL, startUpdate, H), makeEnv(), "yoq", { db });
    expect(res.status).toBe(404);
  });

  it("secret_token yo'q yoki xato: 401 va Telegram API chaqirilmaydi", async () => {
    const db = new FakeDb();
    await seedBot(db);
    const rec = recorder("left");
    const bad: Record<string, string>[] = [{}, { "x-telegram-bot-api-secret-token": "xato" }];
    for (const h of bad) {
      const res = await handleWebhook(post(URL, startUpdate, h), makeEnv(), "b1", { db, configureBot: rec.configureBot });
      expect(res.status).toBe(401);
    }
    expect(rec.calls).toHaveLength(0);
  });

  it("o'chirilgan bot: 200 qaytaradi, hech narsa qilmaydi", async () => {
    const db = new FakeDb();
    await seedBot(db, { enabled: 0 });
    const rec = recorder("left");
    const res = await handleWebhook(post(URL, startUpdate, H), makeEnv(), "b1", { db, configureBot: rec.configureBot });
    expect(res.status).toBe(200);
    expect(rec.calls).toHaveLength(0);
  });

  it("/start, a'zo emas: kanal tugmalari va 'Tekshirish' bilan xabar yuboradi", async () => {
    const db = new FakeDb();
    await seedBot(db);
    const rec = recorder("left");
    const res = await handleWebhook(post(URL, startUpdate, H), makeEnv(), "b1", { db, configureBot: rec.configureBot });
    expect(res.status).toBe(200);
    const send = rec.calls.find((c) => c.method === "sendMessage");
    expect(send).toBeTruthy();
    const kb = JSON.stringify(send!.payload.reply_markup);
    expect(kb).toContain("https://t.me/kanal_bir");
    expect(kb).toContain("https://t.me/kanal_ikki");
    expect(kb).toContain('"callback_data":"chk"');
    expect(rec.calls.filter((c) => c.method === "getChatMember")).toHaveLength(2);
    expect(db.users.has("b1:5")).toBe(true);
  });

  it("/start, hamma kanalda a'zo: tasdiq matni", async () => {
    const db = new FakeDb();
    await seedBot(db);
    const rec = recorder("member");
    await handleWebhook(post(URL, startUpdate, H), makeEnv(), "b1", { db, configureBot: rec.configureBot });
    const send = rec.calls.find((c) => c.method === "sendMessage");
    expect(String(send!.payload.text)).toContain("Rahmat");
    expect(send!.payload.reply_markup).toBeUndefined();
  });

  it("Tekshirish tugmasi: a'zo emas bo'lsa ogohlantirish (alert)", async () => {
    const db = new FakeDb();
    await seedBot(db);
    const rec = recorder("left");
    await handleWebhook(post(URL, chkUpdate, H), makeEnv(), "b1", { db, configureBot: rec.configureBot });
    const ans = rec.calls.find((c) => c.method === "answerCallbackQuery");
    expect(ans!.payload.show_alert).toBe(true);
    expect(rec.calls.some((c) => c.method === "editMessageText")).toBe(false);
  });

  it("Tekshirish tugmasi: a'zo bo'lsa xabar tahrirlanadi", async () => {
    const db = new FakeDb();
    await seedBot(db);
    const rec = recorder("member");
    await handleWebhook(post(URL, chkUpdate, H), makeEnv(), "b1", { db, configureBot: rec.configureBot });
    expect(rec.calls.some((c) => c.method === "editMessageText")).toBe(true);
  });
});

describe("forcesub konfiguratsiyasi", () => {
  it("to'g'ri konfiguratsiyani qabul qiladi", () => {
    expect(parseForceSubConfig({ channels: ["@abcde", "-1001234567890"] }).channels).toHaveLength(2);
  });
  it("bo'sh, ko'p yoki noto'g'ri kanallarni rad etadi", () => {
    expect(() => parseForceSubConfig({ channels: [] })).toThrow();
    expect(() => parseForceSubConfig({})).toThrow();
    expect(() => parseForceSubConfig({ channels: ["@a1234", "@a1235", "@a1236", "@a1237", "@a1238", "@a1239"] })).toThrow();
    expect(() => parseForceSubConfig({ channels: ["kanal"] })).toThrow();
    expect(() => parseForceSubConfig({ channels: ["@ab"] })).toThrow();
  });
});
