// Minimal in-memory stand-in for D1, only for the fx_rates statements used by src/fx/store.ts.

import type { Db, Stmt } from "../../src/db";

export interface FxRow {
  base: string;
  quote: string;
  rate: string;
  updated_at: number;
  source: string | null;
}

export class FxFakeDb implements Db {
  rows = new Map<string, FxRow>();
  statements = 0;
  maxParams = 0;
  failNext = false;

  prepare(sql: string): Stmt {
    const self = this;
    let args: unknown[] = [];
    const exec = (): { results: FxRow[] } => {
      self.statements++;
      self.maxParams = Math.max(self.maxParams, args.length);
      if (self.failNext) {
        self.failNext = false;
        throw new Error("db down");
      }
      if (sql.startsWith("INSERT OR REPLACE INTO fx_rates")) {
        if (args.length % 5 !== 0) throw new Error("bad param count");
        for (let i = 0; i < args.length; i += 5) {
          const [base, quote, rate, ts, source] = args.slice(i, i + 5) as [string, string, string, number, string];
          self.rows.set(`${base}/${quote}`, { base, quote, rate, updated_at: ts, source });
        }
        return { results: [] };
      }
      if (sql.startsWith("DELETE FROM fx_rates WHERE base != ?")) {
        for (const [k, v] of [...self.rows]) if (v.base !== args[0]) self.rows.delete(k);
        return { results: [] };
      }
      if (sql.startsWith("SELECT base, quote, rate, updated_at, source FROM fx_rates")) {
        return { results: [...self.rows.values()] };
      }
      throw new Error(`unsupported SQL: ${sql}`);
    };
    const stmt: Stmt = {
      bind(...v: unknown[]) {
        args = v;
        return stmt;
      },
      async first<T>() {
        return (exec().results[0] as T | undefined) ?? null;
      },
      async all<T>() {
        return exec() as unknown as { results: T[] };
      },
      async run() {
        exec();
        return {};
      },
    };
    return stmt;
  }
}

/** Same, with a D1-style batch() so the store's batch path is exercised. */
export class FxBatchDb extends FxFakeDb {
  batches = 0;
  async batch(stmts: Stmt[]): Promise<unknown[]> {
    this.batches++;
    const out: unknown[] = [];
    for (const s of stmts) out.push(await s.run());
    return out;
  }
}
