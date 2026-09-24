import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineConfig, env, EnvValidationError } from "../src/config.js";

describe("defineConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("aggregates every missing/invalid var into a single error", () => {
    delete process.env.BOT_TOKEN;

    let caught: unknown;
    try {
      defineConfig({
        bot: { token: env("BOT_TOKEN") },
        app: { name: env("APP_NAME", "X") },
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(EnvValidationError);
    expect((caught as EnvValidationError).message).toContain("BOT_TOKEN");
    // exactly one BOT_TOKEN line — the collector and the fallback check must not double-report
    const occurrences = (caught as EnvValidationError).message.match(/BOT_TOKEN/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it("resolves framework defaults when optional vars are absent", () => {
    process.env.BOT_TOKEN = "123:abc";
    const config = defineConfig({ bot: { token: env("BOT_TOKEN") } });

    expect(config.bot.mode).toBe("auto");
    expect(config.bot.polling.timeout).toBe(50);
    expect(config.logging.level).toBe("info");
  });

  it("merges nested overrides without discarding sibling defaults", () => {
    process.env.BOT_TOKEN = "123:abc";
    const config = defineConfig({
      bot: { token: env("BOT_TOKEN"), polling: { limit: 10 } },
    });

    expect(config.bot.polling.limit).toBe(10);
    expect(config.bot.polling.timeout).toBe(50); // untouched sibling default survives the merge
  });

  it("env.enum rejects values outside the allowed set", () => {
    process.env.BOT_TOKEN = "123:abc";
    process.env.BOT_MODE = "carrier-pigeon";

    let caught: unknown;
    try {
      defineConfig({
        bot: {
          token: env("BOT_TOKEN"),
          mode: env.enum("BOT_MODE", ["auto", "polling", "webhook"] as const),
        },
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(EnvValidationError);
  });

  it("a real shell-exported value beats no default at all", () => {
    process.env.BOT_TOKEN = "123:abc";
    process.env.APP_DEBUG = "false";
    const config = defineConfig({
      bot: { token: env("BOT_TOKEN") },
      app: { debug: env.bool("APP_DEBUG", true) },
    });
    expect(config.app.debug).toBe(false);
  });

  it("keyboards.decorators default to disabled with no styles", () => {
    process.env.BOT_TOKEN = "123:abc";
    const config = defineConfig({ bot: { token: env("BOT_TOKEN") } });

    expect(config.keyboards.decorators).toEqual({ enabled: false, styles: {} });
  });

  it("merges user-defined decorator styles on top of (empty) defaults", () => {
    process.env.BOT_TOKEN = "123:abc";
    const config = defineConfig({
      bot: { token: env("BOT_TOKEN") },
      keyboards: { decorators: { enabled: true, styles: { danger: { prefix: "🗑 " } } } },
    });

    expect(config.keyboards.decorators).toEqual({ enabled: true, styles: { danger: { prefix: "🗑 " } } });
  });

  it("rejects database.driver=postgres without a database.url", () => {
    process.env.BOT_TOKEN = "123:abc";

    let caught: unknown;
    try {
      defineConfig({ bot: { token: env("BOT_TOKEN") }, database: { driver: "postgres" } });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(EnvValidationError);
    expect((caught as EnvValidationError).message).toContain("DATABASE_URL");
  });

  it("accepts database.driver=postgres when a database.url is given", () => {
    process.env.BOT_TOKEN = "123:abc";
    const config = defineConfig({
      bot: { token: env("BOT_TOKEN") },
      database: { driver: "postgres", url: "postgres://user:pass@localhost:5432/db" },
    });

    expect(config.database.driver).toBe("postgres");
    expect(config.database.url).toBe("postgres://user:pass@localhost:5432/db");
  });

  it("rejects an invalid APP_KEY instead of silently decoding weak key material", () => {
    expect(() => defineConfig({ bot: { token: "123:abc" }, app: { key: "not-a-32-byte-key" } })).toThrow(/APP_KEY/u);
  });

  it("rejects unsigned callbacks in production unless explicitly acknowledged", () => {
    expect(() =>
      defineConfig({
        bot: { token: "123:abc" },
        app: { env: "production" },
        callbacks: { sign: false },
      }),
    ).toThrow(/CALLBACKS_SIGN/u);

    expect(
      defineConfig({
        bot: { token: "123:abc" },
        app: { env: "production" },
        callbacks: { sign: false, allowUnsignedInProduction: true },
      }).callbacks.sign,
    ).toBe(false);
  });

  it("validates integer ranges and supported callback signature lengths", () => {
    expect(() =>
      defineConfig({
        bot: { token: "123:abc", polling: { limit: 101 } },
        concurrency: { global: 0 },
        callbacks: { sigBytes: 7 },
      }),
    ).toThrow(/BOT_POLLING_LIMIT[\s\S]*CONCURRENCY_GLOBAL[\s\S]*CALLBACK_SIG_BYTES/u);
  });
});
