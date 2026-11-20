import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, randomSecret, timingSafeEqual } from "../src/crypto";
import { TEST_KEY } from "./helpers";

describe("crypto", () => {
  it("shifrlab-ochish aylanishi ishlaydi va shifr matnda token ko'rinmaydi", async () => {
    const t = "123456:ABCDEF_token_value_0123456789xyz";
    const enc = await encryptToken(TEST_KEY, t);
    expect(enc).not.toContain("ABCDEF");
    expect(await decryptToken(TEST_KEY, enc)).toBe(t);
  });

  it("har safar boshqa IV beradi", async () => {
    const a = await encryptToken(TEST_KEY, "x");
    const b = await encryptToken(TEST_KEY, "x");
    expect(a).not.toBe(b);
  });

  it("o'zgartirilgan shifr matn rad etiladi", async () => {
    const enc = await encryptToken(TEST_KEY, "secret");
    const [iv, ct] = enc.split(".");
    const bad = `${iv}.${ct.slice(0, -4)}AAAA`;
    await expect(decryptToken(TEST_KEY, bad)).rejects.toThrow();
  });

  it("noto'g'ri uzunlikdagi kalit rad etiladi", async () => {
    await expect(encryptToken("short", "x")).rejects.toThrow();
  });

  it("timingSafeEqual", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("randomSecret Telegram secret_token alifbosiga mos", () => {
    for (let i = 0; i < 20; i++) expect(randomSecret(32)).toMatch(/^[A-Za-z0-9_-]{1,256}$/);
  });
});
