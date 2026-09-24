import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineConfig, env, EnvValidationError } from "../src/config.js";

/** Runs `build` like a telekit.config.ts would and returns the aggregated problems (empty if it validated). */
function problemsOf(build: () => unknown): Array<{ name: string; reason: string }> {
  try {
    build();
    return [];
  } catch (err) {
    expect(err).toBeInstanceOf(EnvValidationError);
    return (err as EnvValidationError & { context: { problems: Array<{ name: string; reason: string }> } }).context.problems;
  }
}

describe("env() readers", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...originalEnv, BOT_TOKEN: "123:abc" };
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("env.int parses numbers, falls back to defaults, and reports junk or absence", () => {
    process.env.T_INT = "42";
    process.env.T_BAD_INT = "qirq";

    const problems = problemsOf(() =>
      defineConfig({
        bot: { token: env("BOT_TOKEN"), polling: { timeout: env.int("T_INT"), limit: env.int("T_MISSING_INT", 7) } },
        webhook: { port: env.int("T_BAD_INT", 8080), maxConnections: env.int("T_REQUIRED_INT") },
      }),
    );

    expect(problems).toEqual([
      { name: "T_BAD_INT", reason: 'butun son kutilgan, "qirq" keldi' },
      { name: "T_REQUIRED_INT", reason: "majburiy, lekin berilmagan" },
    ]);

    delete process.env.T_BAD_INT;
    const config = defineConfig({
      bot: { token: env("BOT_TOKEN"), polling: { timeout: env.int("T_INT"), limit: env.int("T_MISSING_INT", 7) } },
    });
    expect(config.bot.polling).toEqual({ timeout: 42, limit: 7 });
  });

  it("env.bool accepts true/false/1/0 only", () => {
    process.env.T_TRUE = "true";
    process.env.T_ONE = "1";
    process.env.T_FALSE = "false";
    process.env.T_ZERO = "0";

    const config = defineConfig({
      bot: { token: env("BOT_TOKEN") },
      app: { debug: env.bool("T_TRUE") },
      webhook: { ipAllowlist: env.bool("T_ZERO"), dropPendingUpdates: env.bool("T_ONE") },
      callbacks: { sign: env.bool("T_FALSE"), allowUnsignedInProduction: env.bool("T_UNSET", true) },
    });
    expect([config.app.debug, config.webhook.ipAllowlist, config.webhook.dropPendingUpdates]).toEqual([true, false, true]);
    expect([config.callbacks.sign, config.callbacks.allowUnsignedInProduction]).toEqual([false, true]);

    process.env.T_YES = "yes";
    expect(
      problemsOf(() => defineConfig({ bot: { token: env("BOT_TOKEN") }, app: { debug: env.bool("T_YES"), name: String(env.bool("T_NONE")) } })),
    ).toEqual([
      { name: "T_YES", reason: '"true" yoki "false" kutilgan, "yes" keldi' },
      { name: "T_NONE", reason: "majburiy, lekin berilmagan" },
    ]);
  });

  it("treats an empty variable as unset, and env.enum requires a value when it has no default", () => {
    process.env.T_EMPTY = "";

    const problems = problemsOf(() =>
      defineConfig({
        bot: { token: env("BOT_TOKEN"), mode: env.enum("T_UNSET_MODE", ["polling", "webhook"]) },
        app: { name: env("T_EMPTY") },
      }),
    );

    expect(problems.map((p) => p.name)).toEqual(["T_UNSET_MODE", "T_EMPTY"]);
    expect(problems[0]!.reason).toBe("majburiy, lekin berilmagan");
  });

  it("formats every problem into one TK1001 message", () => {
    delete process.env.BOT_TOKEN;
    let error: EnvValidationError | undefined;
    try {
      defineConfig({ bot: { token: env("BOT_TOKEN") }, app: { name: env("T_NAME_MISSING") } });
    } catch (err) {
      error = err as EnvValidationError;
    }

    expect(error?.code).toBe("TK1001");
    expect(error?.message).toContain("Environment validatsiyadan o'tmadi");
    expect(error?.message).toMatch(/ {2}BOT_TOKEN {16}majburiy/);
    expect(error?.message).toContain("T_NAME_MISSING");
  });
});

describe("defineConfig cross-field checks", () => {
  it("accepts a plain object with no env() calls at all", () => {
    expect(defineConfig({ bot: { token: "123:abc" } }).bot.token).toBe("123:abc");
  });

  it("requires PUBLIC_URL for webhook mode", () => {
    expect(problemsOf(() => defineConfig({ bot: { token: "1:a", mode: "webhook" } })).map((p) => p.name)).toEqual(["PUBLIC_URL"]);
    expect(defineConfig({ bot: { token: "1:a", mode: "webhook" }, webhook: { url: "https://bot.example.com" } }).bot.mode).toBe("webhook");
  });

  it("requires APP_KEY for signed callbacks in production only", () => {
    const production = { bot: { token: "1:a" }, app: { env: "production" as const } };
    expect(problemsOf(() => defineConfig(production)).map((p) => p.name)).toEqual(["APP_KEY"]);
    expect(problemsOf(() => defineConfig({ ...production, callbacks: { sign: false } })).map((p) => p.name)).toEqual(["CALLBACKS_SIGN"]);
    expect(problemsOf(() => defineConfig({ ...production, callbacks: { sign: false, allowUnsignedInProduction: true } }))).toEqual([]);
    const validKey = Buffer.alloc(32, 7).toString("base64");
    expect(problemsOf(() => defineConfig({ ...production, app: { env: "production", key: validKey } }))).toEqual([]);
  });

  it("rejects a database session store without a database", () => {
    const problems = problemsOf(() =>
      defineConfig({ bot: { token: "1:a" }, sessions: { store: "database" }, database: { driver: "none" } }),
    );
    expect(problems.map((p) => p.name)).toEqual(["SESSIONS_STORE"]);
    expect(problemsOf(() => defineConfig({ bot: { token: "1:a" }, sessions: { store: "database" } }))).toEqual([]);
  });
});
