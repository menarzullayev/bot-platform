import { describe, expect, it } from "vitest";
import { MAX_INITDATA_LEN, buildDataCheckString, parseAuthHeader, verifyInitData } from "../../src/miniapp/auth";
import { BOT_TOKEN, NOW, initDataFor, signInitData } from "./util";

const opts = { now: NOW + 10, maxAgeS: 3600 };

describe("verifyInitData: official algorithm", () => {
  it("matches an independently computed vector (Python hmac)", async () => {
    // Computed outside this codebase: secret = HMAC_SHA256("WebAppData", token), hash = HMAC_SHA256(secret, data_check_string)
    const token = "123456:TEST-TOKEN-NOT-REAL-aaaaaaaaaaaaaaaaaaaa";
    const initData =
      "auth_date=1700000000&query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A279058397%2C%22first_name%22%3A%22Vladislav%22%2C%22last_name%22%3A%22Kibenko%22%2C%22username%22%3A%22vdkfrost%22%2C%22language_code%22%3A%22ru%22%2C%22is_premium%22%3Atrue%7D&hash=67e1f6dbfed9f7282150c7e822a4a0656da3d27da070666afc99d218e15974bd";
    const r = await verifyInitData(initData, token, opts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user.id).toBe(279058397);
      expect(r.user.language_code).toBe("ru");
      expect(r.user.is_premium).toBe(true);
      expect(r.authDate).toBe(1_700_000_000);
    }
  });

  it("accepts correctly signed data with the user fields kept", async () => {
    const r = await verifyInitData(initDataFor(BOT_TOKEN, { id: 7, first_name: "Ann", username: "ann" }), BOT_TOKEN, opts);
    expect(r).toMatchObject({ ok: true, user: { id: 7, first_name: "Ann", username: "ann" } });
  });

  it("data_check_string sorts keys, joins with newline and excludes only hash", () => {
    const m = new Map([
      ["user", "{}"],
      ["hash", "x"],
      ["auth_date", "1"],
      ["signature", "sig"],
    ]);
    expect(buildDataCheckString(m)).toBe("auth_date=1\nsignature=sig\nuser={}");
  });

  it("works when Telegram adds the new signature field (it is part of the signed string)", async () => {
    const initData = initDataFor(BOT_TOKEN, {}, NOW, { signature: "abc_DEF-123" });
    expect((await verifyInitData(initData, BOT_TOKEN, opts)).ok).toBe(true);
  });

  it("rejects a forged hash", async () => {
    const good = initDataFor(BOT_TOKEN);
    const forged = good.replace(/hash=[0-9a-f]{64}$/, "hash=" + "0".repeat(64));
    expect(await verifyInitData(forged, BOT_TOKEN, opts)).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects data signed with another token", async () => {
    const other = initDataFor("111111:OtherOtherOtherOtherOtherOtherOther12");
    expect(await verifyInitData(other, BOT_TOKEN, opts)).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects tampered fields (user id swapped after signing)", async () => {
    const good = initDataFor(BOT_TOKEN, { id: 1 });
    const params = new URLSearchParams(good);
    params.set("user", JSON.stringify({ id: 2, first_name: "Test" }));
    expect(await verifyInitData(params.toString(), BOT_TOKEN, opts)).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects an uppercase or short hash as malformed", async () => {
    const good = initDataFor(BOT_TOKEN);
    expect((await verifyInitData(good.replace(/hash=([0-9a-f]{64})$/, (_m, h: string) => "hash=" + h.toUpperCase()), BOT_TOKEN, opts)).ok).toBe(false);
    expect(await verifyInitData(good.replace(/hash=[0-9a-f]{64}$/, "hash=abc"), BOT_TOKEN, opts)).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects a missing hash, empty and oversized input, duplicated keys", async () => {
    const good = initDataFor(BOT_TOKEN);
    expect(await verifyInitData(good.replace(/&?hash=[0-9a-f]{64}/, ""), BOT_TOKEN, opts)).toEqual({ ok: false, reason: "malformed" });
    expect(await verifyInitData("", BOT_TOKEN, opts)).toEqual({ ok: false, reason: "malformed" });
    expect(await verifyInitData("a=" + "b".repeat(MAX_INITDATA_LEN), BOT_TOKEN, opts)).toEqual({ ok: false, reason: "malformed" });
    expect(await verifyInitData(good + "&auth_date=1", BOT_TOKEN, opts)).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects an expired auth_date and accepts the exact boundary", async () => {
    const old = initDataFor(BOT_TOKEN, {}, NOW - 3601);
    expect(await verifyInitData(old, BOT_TOKEN, { now: NOW, maxAgeS: 3600 })).toEqual({ ok: false, reason: "expired" });
    const edge = initDataFor(BOT_TOKEN, {}, NOW - 3600);
    expect((await verifyInitData(edge, BOT_TOKEN, { now: NOW, maxAgeS: 3600 })).ok).toBe(true);
  });

  it("rejects an auth_date from the future beyond the skew allowance", async () => {
    const future = initDataFor(BOT_TOKEN, {}, NOW + 3600);
    expect(await verifyInitData(future, BOT_TOKEN, { now: NOW, maxAgeS: 3600 })).toEqual({ ok: false, reason: "future" });
    expect((await verifyInitData(initDataFor(BOT_TOKEN, {}, NOW + 30), BOT_TOKEN, { now: NOW, maxAgeS: 3600 })).ok).toBe(true);
  });

  it("rejects a non-numeric auth_date", async () => {
    const bad = signInitData(BOT_TOKEN, { auth_date: "yesterday", user: JSON.stringify({ id: 1, first_name: "A" }) });
    expect(await verifyInitData(bad, BOT_TOKEN, opts)).toEqual({ ok: false, reason: "malformed" });
  });

  it.each([
    ["not JSON", "{oops"],
    ["array", "[1]"],
    ["no id", JSON.stringify({ first_name: "A" })],
    ["negative id", JSON.stringify({ id: -5, first_name: "A" })],
    ["string id", JSON.stringify({ id: "5", first_name: "A" })],
    ["float id", JSON.stringify({ id: 1.5, first_name: "A" })],
    ["unsafe id", JSON.stringify({ id: 2 ** 60, first_name: "A" })],
    ["no first_name", JSON.stringify({ id: 5 })],
    ["bad language_code type", JSON.stringify({ id: 5, first_name: "A", language_code: 7 })],
    ["bad is_premium type", JSON.stringify({ id: 5, first_name: "A", is_premium: "yes" })],
    ["oversized", JSON.stringify({ id: 5, first_name: "A", username: "x".repeat(3000) })],
  ])("rejects a signed but broken user JSON: %s", async (_name, user) => {
    const bad = signInitData(BOT_TOKEN, { auth_date: String(NOW), user });
    const r = await verifyInitData(bad, BOT_TOKEN, opts);
    expect(r.ok).toBe(false);
  });

  it("rejects a signed payload without user (e.g. chat-only launch)", async () => {
    const bad = signInitData(BOT_TOKEN, { auth_date: String(NOW), chat_instance: "1" });
    expect(await verifyInitData(bad, BOT_TOKEN, opts)).toEqual({ ok: false, reason: "bad_user" });
  });

  it("never echoes the bot token in its result", async () => {
    for (const data of [initDataFor(BOT_TOKEN), initDataFor("1:wrong"), "garbage", ""]) {
      const r = await verifyInitData(data, BOT_TOKEN, opts);
      expect(JSON.stringify(r)).not.toContain(BOT_TOKEN);
    }
  });
});

describe("parseAuthHeader", () => {
  it("extracts initData from 'tma <data>'", () => {
    expect(parseAuthHeader("tma a=1&b=2")).toBe("a=1&b=2");
    expect(parseAuthHeader("TMA a=1")).toBe("a=1");
  });
  it("rejects other schemes and empty values", () => {
    for (const v of [null, "", "Bearer abc", "tma", "tma ", "tmaa=1", "basic dG1h"]) expect(parseAuthHeader(v)).toBeNull();
  });
});
