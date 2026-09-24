import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { defineCommand, defineEvent, defineMiddleware } from "../src/define.js";
import { generateAppKey, resolveAppKey } from "../src/key.js";
import { createLogger, maskValue } from "../src/logger.js";
import { parseDuration, sleep } from "../src/util/duration.js";

describe("define helpers", () => {
  it("defineCommand and defineMiddleware return their argument unchanged", () => {
    const command = { name: "start", handle: vi.fn() };
    const middleware = vi.fn();
    expect(defineCommand(command)).toBe(command);
    expect(defineMiddleware(middleware)).toBe(middleware);
  });

  it("defineEvent accepts a bare handler or options + handler", () => {
    const handle = vi.fn();
    const filter = () => true;

    expect(defineEvent("message:text", handle)).toEqual({ type: "message:text", handle });
    expect(defineEvent("callback_query", { filter }, handle)).toEqual({ type: "callback_query", filter, handle });
  });
});

describe("app key", () => {
  it("generateAppKey() returns 32 random bytes, base64-encoded", () => {
    const key = generateAppKey();
    expect(Buffer.from(key, "base64")).toHaveLength(32);
    expect(generateAppKey()).not.toBe(key);
  });

  it("resolveAppKey() decodes APP_KEY, or falls back to a random per-process key", () => {
    const key = generateAppKey();
    expect(resolveAppKey({ app: { ...DEFAULT_CONFIG.app, key } }).toString("base64")).toBe(key);

    const random = resolveAppKey({ app: { ...DEFAULT_CONFIG.app, key: "" } });
    expect(random).toHaveLength(32);
    expect(resolveAppKey({ app: { ...DEFAULT_CONFIG.app, key: "" } }).equals(random)).toBe(false);
  });
});

describe("durations", () => {
  it("parseDuration() converts every unit and passes numbers through", () => {
    expect(parseDuration(1500)).toBe(1500);
    expect(parseDuration("250ms")).toBe(250);
    expect(parseDuration("10s")).toBe(10_000);
    expect(parseDuration(" 5m ")).toBe(300_000);
    expect(parseDuration("1.5h")).toBe(5_400_000);
    expect(parseDuration("7d")).toBe(604_800_000);
  });

  it("parseDuration() rejects anything else with a readable message", () => {
    expect(() => parseDuration("5 minutes")).toThrow('Noto\'g\'ri davomiylik formati: "5 minutes"');
    expect(() => parseDuration("")).toThrow();
  });

  it("sleep() resolves after the delay and can be aborted before or during the wait", async () => {
    await expect(sleep(1)).resolves.toBeUndefined();

    const early = new AbortController();
    early.abort(new Error("oldin bekor"));
    await expect(sleep(10_000, early.signal)).rejects.toThrow("oldin bekor");

    const late = new AbortController();
    const waiting = sleep(10_000, late.signal);
    late.abort();
    await expect(waiting).rejects.toBeDefined();

    const finished = new AbortController();
    await sleep(1, finished.signal);
    expect(() => finished.abort()).not.toThrow(); // listener was removed when the sleep completed
  });
});

describe("logger", () => {
  it("masks secret-shaped values, keeping a bot token's numeric id", () => {
    expect(maskValue("token", "123456:ABCdef")).toBe("123456:*****");
    expect(maskValue("apiKey", "abcdefghij")).toBe("abcd*****");
    expect(maskValue("password", "short")).toBe("***");
    expect(maskValue("secret", "")).toBe("");
    expect(maskValue("username", "public")).toBe("public");
    expect(maskValue("token", 12345)).toBe(12345);
  });

  it("writes JSON lines at or above its level, with child bindings and deep masking", () => {
    const lines: string[] = [];
    const log = createLogger({ level: "info", base: { app: "bot" }, sink: (line) => lines.push(line) });

    log.debug({ skipped: true });
    log.child({ scope: "telegram" }).warn({ headers: { authorization: "Bearer abcdefgh" }, list: [{ token: "1:x" }] }, "ogoh");
    log.error({ event: "x" });

    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(first).toMatchObject({
      level: "warn",
      app: "bot",
      scope: "telegram",
      msg: "ogoh",
      headers: { authorization: "Bear*****" },
      list: [{ token: "1:*****" }],
    });
    expect(JSON.parse(lines[1]!)).not.toHaveProperty("msg");
  });

  it("pretty mode prints a label, the event tag and the remaining fields", () => {
    const lines: string[] = [];
    const log = createLogger({ level: "trace", pretty: true, sink: (line) => lines.push(line) });

    log.trace({ event: "startup.begin" }, "boshlandi");
    log.info({ event: "update.handled", duration_ms: 3 }, "tayyor");
    log.fatal({});

    expect(lines).toEqual(["TRACE [startup.begin] boshlandi", 'INFO  [update.handled] tayyor {"duration_ms":3}', "FATAL "]);
  });

  it("defaults to writing to stdout", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    createLogger({ level: "info" }).info({ ok: true }, "stdout");
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"msg":"stdout"'));
    write.mockRestore();
  });
});
