import type { Update } from "@telekit/types";
import { describe, expect, it, vi } from "vitest";
import { Application } from "../src/application.js";
import { DEFAULT_CONFIG, type TelekitConfig } from "../src/config.js";
import { TelegramApi } from "../src/telegram/client.js";
import { createTestDatabase } from "./helpers/test-db.js";

function fakeResponse(body: unknown): Response {
  return { json: async () => body } as Response;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function testConfig(overrides: Partial<TelekitConfig> = {}): TelekitConfig {
  return {
    ...DEFAULT_CONFIG,
    bot: { ...DEFAULT_CONFIG.bot, token: "123:test", mode: "polling" },
    dedup: { ...DEFAULT_CONFIG.dedup, ttl: "5m" },
    // Tests that need a real (in-memory) database pass their own `db` via
    // the `deps` param instead — this keeps every other test from touching
    // the real `storage/telekit.sqlite` file DEFAULT_CONFIG points at,
    // which caused occasional "database is locked" flakiness on Windows.
    database: { driver: "none", file: "", url: null },
    logging: { level: "error", pretty: false }, // keep test output quiet
    ...overrides,
  };
}

/**
 * Builds a fake Telegram backend: `getMe`/`deleteWebhook`/`setMyCommands`
 * behave like a real bot would; `getUpdates` delivers `updates` exactly
 * once, then idles (with a short delay, so the poll loop doesn't spin hot)
 * until the test calls `stop()`. `sendMessage` calls are captured in `sent`.
 */
function fakeTelegramBackend(updates: unknown[]) {
  const sent: Array<{ chat_id: number; text: string }> = [];
  let getUpdatesCalls = 0;

  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    const body = init?.body ? JSON.parse(init.body as string) : {};

    if (href.endsWith("/getMe")) {
      return fakeResponse({ ok: true, result: { id: 999, is_bot: true, first_name: "Bot", username: "my_test_bot" } });
    }
    if (href.endsWith("/deleteWebhook") || href.endsWith("/setMyCommands")) {
      return fakeResponse({ ok: true, result: true });
    }
    if (href.endsWith("/getUpdates")) {
      getUpdatesCalls++;
      if (getUpdatesCalls === 1) {
        return fakeResponse({ ok: true, result: updates });
      }
      await delay(15); // avoid a hot loop while the test asserts / calls stop()
      return fakeResponse({ ok: true, result: [] });
    }
    if (href.endsWith("/sendMessage")) {
      sent.push({ chat_id: body.chat_id, text: body.text });
      return fakeResponse({ ok: true, result: { message_id: sent.length, date: 0, chat: { id: body.chat_id, type: "private" }, text: body.text } });
    }
    throw new Error(`Testda kutilmagan chaqiruv: ${href}`);
  }) as unknown as typeof fetch;

  return { fetchImpl, sent, callCount: () => getUpdatesCalls };
}

describe("Application end-to-end (polling, no real network)", () => {
  it("start() -> a real /start update -> handler runs -> sendMessage is called with the reply", async () => {
    const startUpdate = {
      update_id: 100,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 555, type: "private" },
        from: { id: 555, is_bot: false, first_name: "Ali" },
        text: "/start",
      },
    };
    const { fetchImpl, sent } = fakeTelegramBackend([startUpdate]);
    const api = new TelegramApi({ token: "123:test", fetchImpl });
    const app = new Application(testConfig(), { api });

    app.command("start", async (ctx) => {
      await ctx.reply(`Salom, ${ctx.from?.first_name}!`);
    });

    await app.start();
    await vi.waitFor(() => expect(sent).toHaveLength(1), { timeout: 2000 });
    await app.stop();

    expect(sent[0]).toEqual({ chat_id: 555, text: "Salom, Ali!" });
  });

  it("drops a duplicate update_id instead of running the handler twice", async () => {
    const update = {
      update_id: 200,
      message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, text: "/ping" },
    };
    // Same update_id delivered twice in the very first batch — this is exactly
    // the scenario spec §14.2 dedup exists for (a delayed webhook ack, or a
    // poll offset race, causing Telegram to redeliver).
    const { fetchImpl } = fakeTelegramBackend([update, { ...update }]);
    const api = new TelegramApi({ token: "123:test", fetchImpl });
    const app = new Application(testConfig(), { api });

    let handlerCalls = 0;
    app.command("ping", () => {
      handlerCalls++;
    });

    await app.start();
    await vi.waitFor(() => expect(handlerCalls).toBeGreaterThanOrEqual(1), { timeout: 2000 });
    await delay(30); // let a would-be second run surface if dedup were broken
    await app.stop();

    expect(handlerCalls).toBe(1);
  });

  it("an error thrown in a handler reaches onError instead of crashing the process", async () => {
    const update = {
      update_id: 300,
      message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, text: "/boom" },
    };
    const { fetchImpl, sent } = fakeTelegramBackend([update]);
    const api = new TelegramApi({ token: "123:test", fetchImpl });
    const app = new Application(testConfig(), { api });

    app.command("boom", () => {
      throw new Error("kutilgan test xatosi");
    });
    app.onError(async (_err, ctx) => {
      await ctx.reply("xato ushlandi");
    });

    await app.start();
    await vi.waitFor(() => expect(sent).toHaveLength(1), { timeout: 2000 });
    await app.stop();

    expect(sent[0]?.text).toBe("xato ushlandi");
  });

  it("global middleware runs before routing, in registration order", async () => {
    const update = {
      update_id: 400,
      message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, text: "/track" },
    };
    const { fetchImpl } = fakeTelegramBackend([update]);
    const api = new TelegramApi({ token: "123:test", fetchImpl });
    const app = new Application(testConfig(), { api });

    const order: string[] = [];
    app.use(async (_ctx, next) => {
      order.push("mw-a");
      await next();
    });
    app.use(async (_ctx, next) => {
      order.push("mw-b");
      await next();
    });
    app.command("track", () => {
      order.push("handler");
    });

    await app.start();
    await vi.waitFor(() => expect(order).toContain("handler"), { timeout: 2000 });
    await app.stop();

    expect(order).toEqual(["mw-a", "mw-b", "handler"]);
  });

  it("with a database configured, ctx.user and ctx.db are populated automatically (spec §30.1)", async () => {
    const update = {
      update_id: 500,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 777, type: "private" },
        from: { id: 777, is_bot: false, first_name: "Malika" },
        text: "/whoami",
      },
    };
    const { fetchImpl, sent } = fakeTelegramBackend([update]);
    const api = new TelegramApi({ token: "123:test", fetchImpl });
    const db = await createTestDatabase();
    const app = new Application(testConfig(), { api, db });

    let sawUserId: number | undefined;
    app.command("whoami", async (ctx) => {
      sawUserId = ctx.user?.id;
      expect(ctx.db).toBe(db);
      await ctx.reply(`id=${ctx.user?.id} name=${ctx.user?.firstName}`);
    });

    await app.start();
    await vi.waitFor(() => expect(sent).toHaveLength(1), { timeout: 2000 });

    // Check persistence before stop() — stop() closes `db` (spec §13.3).
    const stored = await db.selectFrom("telekit_users").selectAll().where("id", "=", 777).executeTakeFirst();
    expect(stored?.first_name).toBe("Malika");

    await app.stop();

    expect(sawUserId).toBe(777);
    expect(sent[0]?.text).toBe("id=777 name=Malika");
  });

  it("prepare() + handleUpdate() drive the pipeline directly with zero network calls beyond the handler's own (spec §28.1)", async () => {
    const update: Update = {
      update_id: 600,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 1, type: "private" },
        from: { id: 1, is_bot: false, first_name: "Ali" },
        text: "/hi",
      },
    };
    const sent: Array<{ chat_id: number; text: string }> = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith("/sendMessage")) {
        const body = JSON.parse(init?.body as string);
        sent.push({ chat_id: body.chat_id, text: body.text });
        return fakeResponse({
          ok: true,
          result: { message_id: sent.length, date: 0, chat: { id: body.chat_id, type: "private" }, text: body.text },
        });
      }
      // start()'s getMe/deleteWebhook/setMyCommands must never be reached this way.
      throw new Error(`handleUpdate() shouldn't reach ${href}`);
    }) as unknown as typeof fetch;

    const api = new TelegramApi({ token: "123:test", fetchImpl });
    const app = new Application(testConfig(), { api });
    app.command("hi", async (ctx) => {
      await ctx.reply("salom");
    });

    await app.prepare();
    await app.handleUpdate(update);

    expect(sent).toEqual([{ chat_id: 1, text: "salom" }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
