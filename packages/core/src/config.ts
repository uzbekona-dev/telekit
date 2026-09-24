import type { MigrationSource } from "./db/migrator.js";
import { ConfigurationError } from "./errors.js";
import type { LogLevel } from "./logger.js";

export interface TelekitConfig {
  app: {
    name: string;
    env: "development" | "production" | "test";
    debug: boolean;
    locale: string;
    /** Base64-encoded 32-byte signing key (spec §40.2). Required in production if `callbacks.sign` is true. */
    key: string;
  };
  bot: {
    token: string;
    /** "auto" follows the algorithm in spec §14.7 (dev → polling; prod → webhook if `webhook.url` is a reachable https:// PUBLIC_URL, else polling + a TK103x warning). */
    mode: "auto" | "polling" | "webhook";
    polling: {
      timeout: number;
      limit: number;
    };
  };
  webhook: {
    /** `PUBLIC_URL` — required for `mode: "webhook"` and for `"auto"` to ever choose webhook. */
    url: string | null;
    /** Path segment after `/telegram/webhook/` — derived from `APP_KEY` via HMAC when unset (spec §14.5). */
    path: string | null;
    /** `X-Telegram-Bot-Api-Secret-Token` value — derived from `APP_KEY` via HMAC when unset. */
    secretToken: string | null;
    port: number;
    maxConnections: number;
    dropPendingUpdates: boolean;
    /** Restricts ingress to Telegram's published IP ranges (spec §14.5). Disable only behind a trusted reverse proxy that already enforces this. */
    ipAllowlist: boolean;
    /** "immediate" (default): 200 right away, handler runs after. "await": 200 only once the handler finishes — required on serverless (spec §14.6). */
    responseMode: "immediate" | "await";
  };
  telegram: {
    apiRoot: string;
    timeout: number;
    retry: {
      enabled: boolean;
      attempts: number;
      baseDelay: number;
      maxDelay: number;
    };
    rateLimit: {
      enabled: boolean;
      /** Maximum Bot API requests started per second across this process. */
      globalPerSecond: number;
      /** Maximum messages started per second for one chat. */
      perChatPerSecond: number;
      /** Short bursts allowed before requests are delayed. */
      burst: number;
      /** Pending outgoing calls allowed before backpressure rejects a call. */
      queueLimit: number;
    };
  };
  concurrency: {
    /** Maximum updates executing at once across all chats. */
    global: number;
    /** 1 = strict per-chat ordering (spec §14.3). >1 disables ordering. */
    perChat: number;
    /** Pending updates allowed after the global limit is reached. */
    queueLimit: number;
  };
  dedup: {
    enabled: boolean;
    ttl: string;
  };
  database: {
    driver: "sqlite" | "postgres" | "none";
    /** SQLite file path — ignored for other drivers. */
    file: string;
    /** Postgres connection string (`postgres://user:pass@host:5432/db`) — required when `driver: "postgres"`. */
    url: string | null;
    migrations?: {
      /**
       * Migrations shipped by other framework packages, applied together with
       * core's — automatically in development, and by `telekit migrate` —
       * e.g. `[createConversationsMigrationProvider]` from `@telekit/conversations`.
       */
      providers?: MigrationSource[];
    };
  };
  sessions: {
    enabled: boolean;
    /** "user-chat" scopes state per (chat, user) pair; "chat" shares it across everyone in the chat. */
    key: "user-chat" | "chat";
    store: "memory" | "database";
    ttl: string;
  };
  callbacks: {
    sign: boolean;
    /** HMAC tag length in bytes. 6 keeps callback_data small; see ADR-003. */
    sigBytes: number;
    refTtl: string;
    allowUnsignedInProduction: boolean;
  };
  keyboards: {
    /** Text-only decorators (spec §24.4) — Bot API has no button color/style field, so `style` prepends/appends plain text instead. */
    decorators: {
      enabled: boolean;
      styles: Record<string, { prefix?: string; suffix?: string }>;
    };
  };
  logging: {
    level: LogLevel;
    pretty: boolean;
  };
  shutdown: {
    /** Time for a load balancer to observe draining before connections close. */
    drainDelayMs: number;
    timeoutMs: number;
  };
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer _U)[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type TelekitConfigInput = DeepPartial<TelekitConfig>;

export const DEFAULT_CONFIG: TelekitConfig = {
  app: { name: "MyBot", env: "development", debug: true, locale: "uz", key: "" },
  bot: { token: "", mode: "auto", polling: { timeout: 50, limit: 100 } },
  webhook: {
    url: null,
    path: null,
    secretToken: null,
    port: 8080,
    maxConnections: 40,
    dropPendingUpdates: false,
    ipAllowlist: true,
    responseMode: "immediate",
  },
  telegram: {
    apiRoot: "https://api.telegram.org",
    timeout: 30_000,
    retry: { enabled: true, attempts: 5, baseDelay: 300, maxDelay: 30_000 },
    rateLimit: { enabled: true, globalPerSecond: 30, perChatPerSecond: 1, burst: 3, queueLimit: 1_000 },
  },
  concurrency: { global: 100, perChat: 1, queueLimit: 1_000 },
  dedup: { enabled: true, ttl: "5m" },
  database: { driver: "sqlite", file: "storage/telekit.sqlite", url: null, migrations: { providers: [] } },
  // "memory" is the safe zero-dependency default (works with database.driver="none");
  // switch to "database" once a real database is configured, for persistence across restarts.
  sessions: { enabled: true, key: "user-chat", store: "memory", ttl: "30d" },
  callbacks: { sign: true, sigBytes: 6, refTtl: "7d", allowUnsignedInProduction: false },
  keyboards: { decorators: { enabled: false, styles: {} } },
  logging: { level: "info", pretty: true },
  shutdown: { drainDelayMs: 0, timeoutMs: 30_000 },
};

interface EnvProblem {
  name: string;
  reason: string;
}

export class EnvValidationError extends ConfigurationError {
  constructor(problems: EnvProblem[]) {
    const lines = problems.map((p) => `  ${p.name.padEnd(24)} ${p.reason}`).join("\n");
    super(
      "TK1001",
      `Environment validatsiyadan o'tmadi:\n\n${lines}\n\nHujjat: https://telekit.dev/errors/TK1001`,
      { context: { problems } },
    );
  }
}

class EnvCollector {
  readonly problems: EnvProblem[] = [];

  constructor(private readonly source: NodeJS.ProcessEnv) {}

  private raw(name: string): string | undefined {
    const value = this.source[name];
    return value === undefined || value === "" ? undefined : value;
  }

  string(name: string, defaultValue?: string): string {
    const value = this.raw(name);
    if (value !== undefined) return value;
    if (defaultValue !== undefined) return defaultValue;
    this.problems.push({ name, reason: "majburiy, lekin berilmagan" });
    return "";
  }

  int(name: string, defaultValue?: number): number {
    const value = this.raw(name);
    if (value === undefined) {
      if (defaultValue !== undefined) return defaultValue;
      this.problems.push({ name, reason: "majburiy, lekin berilmagan" });
      return 0;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      this.problems.push({ name, reason: `butun son kutilgan, "${value}" keldi` });
      return defaultValue ?? 0;
    }
    return parsed;
  }

  bool(name: string, defaultValue?: boolean): boolean {
    const value = this.raw(name);
    if (value === undefined) {
      if (defaultValue !== undefined) return defaultValue;
      this.problems.push({ name, reason: "majburiy, lekin berilmagan" });
      return false;
    }
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    this.problems.push({ name, reason: `"true" yoki "false" kutilgan, "${value}" keldi` });
    return defaultValue ?? false;
  }

  enumVal<T extends string>(name: string, allowed: readonly T[], defaultValue?: T): T {
    const value = this.raw(name);
    if (value === undefined) {
      if (defaultValue !== undefined) return defaultValue;
      this.problems.push({ name, reason: "majburiy, lekin berilmagan" });
      return allowed[0] as T;
    }
    if (!allowed.includes(value as T)) {
      const options = allowed.map((a) => `"${a}"`).join(" | ");
      this.problems.push({ name, reason: `${options} kutilgan, "${value}" keldi` });
      return defaultValue ?? (allowed[0] as T);
    }
    return value as T;
  }
}

let activeCollector: EnvCollector | null = null;

function collector(): EnvCollector {
  activeCollector ??= new EnvCollector(process.env);
  return activeCollector;
}

export interface EnvFn {
  (name: string): string;
  (name: string, defaultValue: string): string;
  int(name: string, defaultValue?: number): number;
  bool(name: string, defaultValue?: boolean): boolean;
  /**
   * `const T` (TS 5.0+) infers the literal union straight from the array
   * literal — callers never need to write `as const` on the allowed list.
   */
  enum<const T extends readonly string[]>(name: string, allowed: T, defaultValue?: T[number]): T[number];
}

/**
 * Reads `process.env`, collecting problems instead of throwing immediately.
 * `defineConfig` drains the collector once the whole config object literal
 * has been evaluated, so every missing/invalid variable is reported together
 * (spec §22.2) rather than one-at-a-time.
 */
export const env = ((name: string, defaultValue?: string) =>
  collector().string(name, defaultValue)) as EnvFn;
env.int = (name, defaultValue) => collector().int(name, defaultValue);
env.bool = (name, defaultValue) => collector().bool(name, defaultValue);
env.enum = (name, allowed, defaultValue) => collector().enumVal(name, allowed, defaultValue);

function mergeConfig(base: TelekitConfig, input: TelekitConfigInput): TelekitConfig {
  return {
    app: { ...base.app, ...input.app },
    bot: {
      ...base.bot,
      ...input.bot,
      polling: { ...base.bot.polling, ...input.bot?.polling },
    },
    webhook: { ...base.webhook, ...input.webhook },
    telegram: {
      ...base.telegram,
      ...input.telegram,
      retry: { ...base.telegram.retry, ...input.telegram?.retry },
      rateLimit: { ...base.telegram.rateLimit, ...input.telegram?.rateLimit },
    },
    concurrency: { ...base.concurrency, ...input.concurrency },
    dedup: { ...base.dedup, ...input.dedup },
    database: {
      ...base.database,
      ...input.database,
      migrations: { providers: input.database?.migrations?.providers ?? base.database.migrations?.providers ?? [] },
    },
    sessions: { ...base.sessions, ...input.sessions },
    callbacks: { ...base.callbacks, ...input.callbacks },
    keyboards: {
      decorators: {
        enabled: input.keyboards?.decorators?.enabled ?? base.keyboards.decorators.enabled,
        // DeepPartial turns a `Record<string, X>` index signature into `{[x: string]?: DeepPartial<X> | undefined}`,
        // which the spread below can't narrow back to `Record<string, X>` on its own — hence the cast.
        styles: {
          ...base.keyboards.decorators.styles,
          ...input.keyboards?.decorators?.styles,
        } as TelekitConfig["keyboards"]["decorators"]["styles"],
      },
    },
    logging: { ...base.logging, ...input.logging },
    shutdown: { ...base.shutdown, ...input.shutdown },
  };
}

/**
 * Resolves the final config and validates it. Must be called synchronously
 * after building the input object literal (so all `env()` calls inside it
 * have already registered with the active collector) — see spec §22.3.
 */
export function defineConfig(input: TelekitConfigInput): TelekitConfig {
  const collected = activeCollector;
  activeCollector = null;

  const problems = collected ? [...collected.problems] : [];
  const merged = mergeConfig(DEFAULT_CONFIG, input);

  const addProblem = (name: string, reason: string): void => {
    if (!problems.some((problem) => problem.name === name)) problems.push({ name, reason });
  };
  const requireInteger = (name: string, value: number, min: number, max?: number): void => {
    if (!Number.isInteger(value) || value < min || (max !== undefined && value > max)) {
      const range = max === undefined ? `${min} yoki undan katta` : `${min}..${max}`;
      addProblem(name, `${range} oralig'idagi butun son bo'lishi kerak, ${value} keldi`);
    }
  };

  if (!merged.bot.token && !problems.some((p) => p.name === "BOT_TOKEN")) {
    addProblem("BOT_TOKEN", "majburiy, lekin berilmagan (@BotFather dan oling)");
  }
  if (merged.database.driver === "postgres" && !merged.database.url && !problems.some((p) => p.name === "DATABASE_URL")) {
    addProblem("DATABASE_URL", 'database.driver="postgres" tanlangan bo\'lsa majburiy (masalan: postgres://user:pass@host:5432/db)');
  }
  if (merged.bot.mode === "webhook" && !merged.webhook.url && !problems.some((p) => p.name === "PUBLIC_URL")) {
    addProblem("PUBLIC_URL", 'bot.mode="webhook" tanlangan bo\'lsa majburiy (masalan: https://bot.example.com)');
  }
  if (merged.webhook.url) {
    try {
      const url = new URL(merged.webhook.url);
      if (url.protocol !== "https:") addProblem("PUBLIC_URL", "webhook URL https:// bilan boshlanishi kerak");
    } catch {
      addProblem("PUBLIC_URL", "to'g'ri URL bo'lishi kerak");
    }
  }
  if (merged.app.key) {
    const normalized = merged.app.key.replace(/=+$/u, "");
    const decoded = Buffer.from(merged.app.key, "base64");
    const roundTrip = decoded.toString("base64").replace(/=+$/u, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(merged.app.key) || decoded.length !== 32 || roundTrip !== normalized) {
      addProblem("APP_KEY", "32 baytli to'g'ri base64 kalit bo'lishi kerak — `telekit key:generate` ishlating");
    }
  }
  if (
    merged.app.env === "production" &&
    merged.callbacks.sign &&
    !merged.app.key &&
    !problems.some((p) => p.name === "APP_KEY")
  ) {
    addProblem("APP_KEY", "production'da callbacks.sign=true bo'lganda majburiy — `telekit key:generate` bilan hosil qiling");
  }
  if (merged.app.env === "production" && !merged.callbacks.sign && !merged.callbacks.allowUnsignedInProduction) {
    addProblem(
      "CALLBACKS_SIGN",
      "production'da unsigned callback taqiqlangan; callbacks.sign=true qiling yoki xavfni ongli qabul qilib allowUnsignedInProduction=true bering",
    );
  }
  if (merged.sessions.enabled && merged.sessions.store === "database" && merged.database.driver === "none") {
    addProblem("SESSIONS_STORE", 'sessions.store="database" tanlangan, lekin database.driver="none" — "memory" ishlating yoki bazani yoqing');
  }

  // Values returned as placeholders by a failed env.int() must not create a
  // second, unrelated-looking range error. Semantic ranges run once raw env
  // parsing itself is clean (plain-object config always reaches this block).
  if (!collected || collected.problems.length === 0) {
    requireInteger("BOT_POLLING_TIMEOUT", merged.bot.polling.timeout, 0, 50);
    requireInteger("BOT_POLLING_LIMIT", merged.bot.polling.limit, 1, 100);
    requireInteger("WEBHOOK_PORT", merged.webhook.port, 1, 65_535);
    requireInteger("WEBHOOK_MAX_CONNECTIONS", merged.webhook.maxConnections, 1, 100);
    requireInteger("TELEGRAM_TIMEOUT", merged.telegram.timeout, 1);
    requireInteger("TELEGRAM_RETRY_ATTEMPTS", merged.telegram.retry.attempts, 1);
    requireInteger("TELEGRAM_RETRY_BASE_DELAY", merged.telegram.retry.baseDelay, 0);
    requireInteger("TELEGRAM_RETRY_MAX_DELAY", merged.telegram.retry.maxDelay, merged.telegram.retry.baseDelay);
    requireInteger("CONCURRENCY_GLOBAL", merged.concurrency.global, 1);
    requireInteger("CONCURRENCY_PER_CHAT", merged.concurrency.perChat, 1);
    requireInteger("CONCURRENCY_QUEUE_LIMIT", merged.concurrency.queueLimit, 0);
    requireInteger("RATE_LIMIT_GLOBAL", merged.telegram.rateLimit.globalPerSecond, 1);
    requireInteger("RATE_LIMIT_PER_CHAT", merged.telegram.rateLimit.perChatPerSecond, 1);
    requireInteger("RATE_LIMIT_BURST", merged.telegram.rateLimit.burst, 1);
    requireInteger("RATE_LIMIT_QUEUE_LIMIT", merged.telegram.rateLimit.queueLimit, 0);
    requireInteger("CALLBACK_SIG_BYTES", merged.callbacks.sigBytes, 1, 32);
    if (![6, 8, 16].includes(merged.callbacks.sigBytes)) {
      addProblem("CALLBACK_SIG_BYTES", "faqat 6, 8 yoki 16 bayt qo'llab-quvvatlanadi");
    }
    requireInteger("SHUTDOWN_DRAIN_DELAY", merged.shutdown.drainDelayMs, 0);
    requireInteger("SHUTDOWN_TIMEOUT", merged.shutdown.timeoutMs, 1);
  }
  if (problems.length > 0) {
    throw new EnvValidationError(problems);
  }
  return merged;
}
