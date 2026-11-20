// P5 test helpers: a real SQLite (node:sqlite) behind the Db interface with the real migrations applied,
// so upserts, BLOBs and COUNT queries are exercised for real instead of being re-implemented in a fake.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Db, Stmt } from "../src/db";
import { dayOf } from "../src/metrics";
import type { CacheLike } from "../src/miniapp/cards";
import { makeBotRow } from "./miniapp/util";

export * from "./miniapp/util";

export class SqliteDb implements Db {
  raw = new DatabaseSync(":memory:");
  reads = 0;
  writes = 0;
  batches = 0;
  /** Every executed SQL text, in order. */
  sqls: string[] = [];
  /** When set, statements whose SQL matches throw (simulated D1 outage). */
  failOn: RegExp | null = null;
  withBatch: boolean;

  constructor(opts: { withBatch?: boolean } = {}) {
    this.withBatch = opts.withBatch ?? false;
    const dir = join(process.cwd(), "migrations");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) this.raw.exec(readFileSync(join(dir, f), "utf8"));
    if (this.withBatch) {
      (this as unknown as { batch: (s: Stmt[]) => Promise<unknown[]> }).batch = async (stmts: Stmt[]) => {
        this.batches++;
        const out: unknown[] = [];
        for (const s of stmts) out.push(await s.run());
        return out;
      };
    }
  }

  resetCounters(): void {
    this.reads = 0;
    this.writes = 0;
    this.batches = 0;
    this.sqls = [];
  }

  prepare(sql: string): Stmt {
    const self = this;
    let args: unknown[] = [];
    const conv = (v: unknown) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v === undefined ? null : v);
    const exec = <T>(kind: "first" | "all" | "run"): T => {
      self.sqls.push(sql);
      if (self.failOn?.test(sql)) throw new Error("D1 unavailable (test)");
      const st = self.raw.prepare(sql);
      const a = args.map(conv) as never[];
      if (/^\s*select/i.test(sql)) self.reads++;
      else self.writes++;
      if (kind === "first") return ((st.get(...a) as T | undefined) ?? null) as T;
      if (kind === "all") return { results: st.all(...a).map((r) => ({ ...(r as object) })) } as T;
      return st.run(...a) as T;
    };
    const stmt: Stmt = {
      bind(...v: unknown[]) {
        args = v;
        return stmt;
      },
      async first<T>() {
        const r = exec<T | null>("first");
        return r ? ({ ...(r as object) } as T) : null;
      },
      async all<T>() {
        return exec<{ results: T[] }>("all");
      },
      async run() {
        return exec<unknown>("run");
      },
    };
    return stmt;
  }

  /** Plain SQL helpers for assertions (not counted). */
  rows<T = Record<string, unknown>>(sql: string, ...a: unknown[]): T[] {
    return this.raw.prepare(sql).all(...(a as never[])).map((r) => ({ ...(r as object) })) as T[];
  }
  exec(sql: string, ...a: unknown[]): void {
    this.raw.prepare(sql).run(...(a as never[]));
  }
  metric(day: string, bot: string, key: string): number | null {
    const r = this.rows<{ n: number }>("SELECT n FROM metrics_daily WHERE day = ? AND bot_id = ? AND key = ?", day, bot, key)[0];
    return r ? r.n : null;
  }
  setReq(day: string, n: number, bot = "tezcalc"): void {
    this.exec("INSERT OR REPLACE INTO metrics_daily (day, bot_id, key, n) VALUES (?, ?, 'req', ?)", day, bot, n);
  }
  async addBot(id = "tezcalc", config: Record<string, unknown> = {}, enabled = 1): Promise<void> {
    const r = (await makeBotRow(config, enabled)) as Record<string, unknown>;
    this.exec(
      "INSERT OR REPLACE INTO bots (id, token_enc, secret, bot_info, template, config, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      r.token_enc,
      r.secret,
      r.bot_info,
      r.template,
      r.config,
      enabled,
      1,
    );
  }
}

/** UTC day string of a Unix-seconds timestamp. */
export const dayOfSec = (sec: number): string => dayOf(sec * 1000);

/** A minimal structurally valid PNG of about `size` bytes (IDAT payload is filler; CRCs are not checked). */
export function makePng(w = 8, h = 8, size = 200): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = new Uint8Array(25);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, 13);
  ihdr.set([0x49, 0x48, 0x44, 0x52], 4);
  dv.setUint32(8, w);
  dv.setUint32(12, h);
  ihdr.set([8, 6, 0, 0, 0], 16);
  const iend = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
  const fixed = sig.length + ihdr.length + 12 + iend.length;
  const idatLen = Math.max(0, size - fixed);
  const out = new Uint8Array(sig.length + ihdr.length + 12 + idatLen + iend.length);
  let o = 0;
  out.set(sig, o);
  o += sig.length;
  out.set(ihdr, o);
  o += ihdr.length;
  new DataView(out.buffer).setUint32(o, idatLen);
  out.set([0x49, 0x44, 0x41, 0x54], o + 4);
  for (let i = 0; i < idatLen; i++) out[o + 8 + i] = (i * 31 + 7) & 0xff;
  o += 8 + idatLen + 4; // + CRC placeholder
  out.set(iend, o);
  return out;
}

/** A minimal structurally valid JPEG (SOI, APP0, SOF0 with the given size, SOS, filler, EOI) of about `size` bytes. */
export function makeJpeg(w = 720, h = 405, size = 400): Uint8Array {
  const head = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof = [0xff, 0xc0, 0x00, 0x0b, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x01, 0x01, 0x11, 0x00];
  const sos = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00];
  const fixed = head.length + sof.length + sos.length + 2;
  const fill = Math.max(0, size - fixed);
  const out = new Uint8Array(fixed + fill);
  out.set([...head, ...sof, ...sos], 0);
  // entropy data: never 0xFF so no accidental markers
  for (let i = 0; i < fill; i++) out[head.length + sof.length + sos.length + i] = (i * 31 + 7) & 0x7f;
  out.set([0xff, 0xd9], out.length - 2);
  return out;
}

/** Map-backed Cache API double that records the TTL of every put. */
export class MapCache implements CacheLike {
  store = new Map<string, { body: Uint8Array; headers: Headers }>();
  matches = 0;
  puts: { url: string; cacheControl: string | null }[] = [];
  failMatch = false;
  failPut = false;
  async match(req: Request): Promise<Response | undefined> {
    this.matches++;
    if (this.failMatch) throw new Error("cache down");
    const e = this.store.get(req.url);
    return e ? new Response(e.body, { headers: e.headers }) : undefined;
  }
  async put(req: Request, res: Response): Promise<void> {
    if (this.failPut) throw new Error("cache write failed");
    this.puts.push({ url: req.url, cacheControl: res.headers.get("cache-control") });
    this.store.set(req.url, { body: new Uint8Array(await res.arrayBuffer()), headers: new Headers(res.headers) });
  }
}

/** ExecutionContext double: collects waitUntil promises so tests can await background work. */
export class FakeCtx {
  promises: Promise<unknown>[] = [];
  waitUntil(p: Promise<unknown>): void {
    this.promises.push(p);
  }
  passThroughOnException(): void {}
  async settle(): Promise<void> {
    await Promise.all(this.promises);
    this.promises = [];
  }
}

export function eqBytes(a: Uint8Array | ArrayBuffer | number[], b: Uint8Array): boolean {
  const x = a instanceof Uint8Array ? a : a instanceof ArrayBuffer ? new Uint8Array(a) : Uint8Array.from(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

// ---- Mini App API context on a real SQLite -------------------------------------------------------------------------

import { handleAppApi } from "../src/miniapp/api";
import type { Env } from "../src/env";
import type { PlatformDeps } from "../src/templates";
import { ADMIN_TOKEN, BOT_ID, BOT_TOKEN, NOW, apiRequest, initDataFor } from "./miniapp/util";
import { TEST_KEY } from "./helpers";

export interface ApiCtx {
  db: SqliteDb;
  env: Env;
  deps: PlatformDeps;
  clock: { ms: number };
  fetches: { url: string; body: unknown }[];
  call(action: string, o?: { method?: string; body?: unknown; user?: number; noAuth?: boolean; botId?: string }): Promise<Response>;
}

export async function apiCtx(envExtra: Partial<Env> = {}): Promise<ApiCtx> {
  const db = new SqliteDb();
  await db.addBot();
  const env = {
    DB: db as unknown as D1Database,
    TOKEN_KEY: TEST_KEY,
    ADMIN_TOKEN,
    PUBLIC_BASE_URL: "https://example.test",
    APP_ENV: "production",
    INITDATA_MAX_AGE_S: "3600",
    ...envExtra,
  } as Env;
  const clock = { ms: (NOW + 10) * 1000 };
  const fetches: { url: string; body: unknown }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    fetches.push({ url: String(url), body: init.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ ok: true, result: "https://t.me/$inv" }), { status: 200 });
  }) as unknown as typeof fetch;
  const deps: PlatformDeps = { db, fetchFn, nowMs: () => clock.ms, now: () => Math.floor(clock.ms / 1000) };
  return {
    db,
    env,
    deps,
    clock,
    fetches,
    call: (action, o = {}) =>
      handleAppApi(
        apiRequest(
          action,
          { method: o.method, body: o.body, initData: o.noAuth ? null : initDataFor(BOT_TOKEN, { id: o.user ?? 4242 }, NOW) },
          o.botId ?? BOT_ID,
        ),
        env,
        deps,
      ),
  };
}
