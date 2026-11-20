import type { Bot } from "grammy";
import type { Db } from "../db";
import { validateEnv, type AppConfig, type Deps, type Env } from "../env";
import type { PlatformState, RateLimitOptions } from "../ratelimit";
import { forcesubTemplate } from "./forcesub";

export interface BotCommand {
  command: string;
  description: string;
}

/** Everything setMyCommands/setMyName/... need. Keys are language codes or "default". */
export interface BotProfile {
  commands: Record<string, BotCommand[]>;
  names: Record<string, string>;
  shortDescriptions: Record<string, string>;
  descriptions: Record<string, string>;
}

/** Extra (optional) test/runtime dependencies on top of the shared Deps. */
export interface PlatformDeps extends Deps {
  appConfig?: AppConfig;
  /** Rate limiter + update_id dedup state; defaults to isolate-local state keyed by the DB binding. */
  platform?: PlatformState;
  /** Wall-clock in ms for rate limiting and dedup (defaults to Date.now). */
  nowMs?: () => number;
}

export interface TemplateCtx<TConfig = unknown> {
  botId: string;
  db: Db;
  env: Env;
  /** Parsed template config of this bot. */
  config: TConfig;
  /** Platform-wide settings from validateEnv. */
  appConfig: AppConfig;
  /** Unix seconds. */
  now: () => number;
  fetchFn: typeof fetch;
  /**
   * Consumes one token of the `${botId}:${userId}` bucket; true means the user is over the limit.
   * For templates that set `rateLimit: false` and enforce limits themselves.
   */
  rateLimited: (userId: number) => boolean;
}

export interface ScheduledDeps<TConfig = unknown> {
  botId: string;
  config: TConfig;
  db: Db;
  appConfig: AppConfig;
  now: () => number;
  fetchFn: typeof fetch;
}

export interface Template<TConfig = unknown> {
  name: string;
  /** Validates raw JSON config; throws Error with a user-facing message. */
  parseConfig(raw: unknown): TConfig;
  install(bot: Bot, ctx: TemplateCtx<TConfig>): void;
  /** Command list, names and descriptions pushed to Telegram by POST /admin/bots/:id/setup. */
  profile?(config: TConfig): BotProfile;
  /** Called by the hourly cron once per enabled bot of this template. */
  scheduled?(env: Env, deps: ScheduledDeps<TConfig>): Promise<void>;
  /** Platform per-user limit override; `false` exempts the template (use ctx.rateLimited instead). */
  rateLimit?: RateLimitOptions | false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTemplate = Template<any>;

const registry = new Map<string, AnyTemplate>();

export function registerTemplate<T>(t: Template<T>): void {
  if (registry.has(t.name)) throw new Error(`template already registered: ${t.name}`);
  registry.set(t.name, t);
}

/** Mainly for tests. */
export function unregisterTemplate(name: string): void {
  registry.delete(name);
}

export function getTemplate(name: string): AnyTemplate | undefined {
  return registry.get(name);
}

export function listTemplateNames(): string[] {
  return [...registry.keys()];
}

registerTemplate(forcesubTemplate);

const FALLBACK_CONFIG: AppConfig = {
  appEnv: "local",
  publicBaseUrl: null,
  logLevel: "info",
  initDataMaxAgeS: 3600,
  defaultLang: "uz-latn",
};

/** AppConfig from deps (index.ts passes the validated one), else re-validate, else safe defaults. */
export function resolveAppConfig(env: Env, deps: PlatformDeps = {}): AppConfig {
  if (deps.appConfig) return deps.appConfig;
  const c = validateEnv(env);
  return c.ok ? c.config : FALLBACK_CONFIG;
}
