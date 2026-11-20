import { describe, expect, it } from "vitest";
import { validateEnv } from "../src/env";
import { ADMIN, TEST_KEY } from "./helpers";

const DB = {} as D1Database;
const good = {
  DB,
  TOKEN_KEY: TEST_KEY,
  ADMIN_TOKEN: "a".repeat(32),
  PUBLIC_BASE_URL: "https://w.example.workers.dev",
};

describe("validateEnv", () => {
  it("to'g'ri muhit: standart qiymatlar", () => {
    const r = validateEnv(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.appEnv).toBe("production");
      expect(r.config.defaultLang).toBe("uz-latn");
      expect(r.config.initDataMaxAgeS).toBe(3600);
    }
  });

  it("local: http://localhost ruxsat, PUBLIC_BASE_URL ixtiyoriy", () => {
    expect(validateEnv({ ...good, APP_ENV: "local", PUBLIC_BASE_URL: "http://localhost:8787" }).ok).toBe(true);
    expect(validateEnv({ ...good, APP_ENV: "local", PUBLIC_BASE_URL: undefined }).ok).toBe(true);
  });

  const bad: [string, Record<string, unknown>][] = [
    ["TOKEN_KEY yo'q", { TOKEN_KEY: undefined }],
    ["TOKEN_KEY qisqa", { TOKEN_KEY: btoa("short") }],
    ["TOKEN_KEY base64 emas", { TOKEN_KEY: "!".repeat(44) }],
    ["ADMIN_TOKEN qisqa", { ADMIN_TOKEN: ADMIN }],
    ["TOKEN_KEY_PREV noto'g'ri", { TOKEN_KEY_PREV: "x" }],
    ["APP_ENV noma'lum", { APP_ENV: "staging" }],
    ["LOG_LEVEL noma'lum", { LOG_LEVEL: "loud" }],
    ["DEFAULT_LANG noma'lum", { DEFAULT_LANG: "de" }],
    ["INITDATA_MAX_AGE_S son emas", { INITDATA_MAX_AGE_S: "abc" }],
    ["INITDATA_MAX_AGE_S juda kichik", { INITDATA_MAX_AGE_S: "5" }],
    ["PUBLIC_BASE_URL productionda yo'q", { PUBLIC_BASE_URL: undefined }],
    ["PUBLIC_BASE_URL http productionda", { PUBLIC_BASE_URL: "http://w.example.com" }],
    ["PUBLIC_BASE_URL oxirida /", { PUBLIC_BASE_URL: "https://w.example.com/" }],
    ["DB yo'q", { DB: undefined }],
  ];
  for (const [name, patch] of bad) {
    it(`rad etadi: ${name}`, () => {
      const r = validateEnv({ ...good, ...patch } as never);
      expect(r.ok).toBe(false);
    });
  }

  it("xato matnida qiymat chiqmaydi", () => {
    const secret = "TOP-SECRET-VALUE-0123456789";
    const r = validateEnv({ ...good, ADMIN_TOKEN: secret.slice(0, 10) });
    expect(JSON.stringify(r)).not.toContain(secret.slice(0, 10));
  });
});
