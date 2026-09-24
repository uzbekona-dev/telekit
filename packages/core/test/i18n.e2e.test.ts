import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { Application } from "../src/application.js";
import { DEFAULT_CONFIG, type TelekitConfig } from "../src/config.js";
import { loadLocales } from "../src/i18n/load-locales.js";
import { localePicker } from "../src/i18n/locale-picker.js";
import { TelegramApi } from "../src/telegram/client.js";
import { createTestDatabase } from "./helpers/test-db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_CWD = path.join(__dirname, "fixtures"); // contains ./locales/{uz,ru}/bot.json

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
    database: { ...DEFAULT_CONFIG.database, driver: "none", file: "", url: null },
    dedup: { ...DEFAULT_CONFIG.dedup, ttl: "5m" },
    logging: { level: "error", pretty: false },
    ...overrides,
  };
}

/** Same shape as application.e2e.test.ts's helper, plus answerCallbackQuery — needed for the lang: switch flow. */
function fakeTelegramBackend(updates: unknown[]) {
  const sent: Array<{ chat_id: number; text: string }> = [];
  const answered: Array<{ callback_query_id: string; text?: string }> = [];
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
      if (getUpdatesCalls === 1) return fakeResponse({ ok: true, result: updates });
      await delay(15);
      return fakeResponse({ ok: true, result: [] });
    }
    if (href.endsWith("/sendMessage")) {
      sent.push({ chat_id: body.chat_id, text: body.text });
      return fakeResponse({ ok: true, result: { message_id: sent.length, date: 0, chat: { id: body.chat_id, type: "private" }, text: body.text } });
    }
    if (href.endsWith("/answerCallbackQuery")) {
      answered.push({ callback_query_id: body.callback_query_id, text: body.text });
      return fakeResponse({ ok: true, result: true });
    }
    throw new Error(`Testda kutilmagan chaqiruv: ${href}`);
  }) as unknown as typeof fetch;

  return { fetchImpl, sent, answered };
}

describe("i18n end-to-end", () => {
  it("ctx.t() resolves via the telegram language_code strategy and formats a plural", async () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 1, type: "private" },
        from: { id: 1, is_bot: false, first_name: "Ali", language_code: "ru-RU" },
        text: "/orders",
      },
    };
    const { fetchImpl, sent } = fakeTelegramBackend([update]);
    const app = new Application(testConfig(), { api: new TelegramApi({ token: "123:test", fetchImpl }) });
    await loadLocales(app, { cwd: FIXTURES_CWD, dir: "locales", defaultLocale: "uz" });

    app.command("orders", async (ctx) => {
      expect(ctx.locale).toBe("ru");
      await ctx.reply(ctx.t("bot.welcome", { name: ctx.from?.first_name }));
    });

    await app.start();
    await vi.waitFor(() => expect(sent).toHaveLength(1), { timeout: 2000 });
    await app.stop();

    expect(sent[0]?.text).toBe("Здравствуйте, Ali!");
  });

  it("ctx.t() falls back to the project default locale with no telegram/user locale available", async () => {
    const update = {
      update_id: 2,
      message: { message_id: 1, date: 0, chat: { id: 2, type: "private" }, text: "/orders" },
    };
    const { fetchImpl, sent } = fakeTelegramBackend([update]);
    const app = new Application(testConfig(), { api: new TelegramApi({ token: "123:test", fetchImpl }) });
    await loadLocales(app, { cwd: FIXTURES_CWD, dir: "locales", defaultLocale: "uz" });

    app.command("orders", async (ctx) => {
      await ctx.reply(ctx.t("bot.welcome", { name: "Vali" }));
    });

    await app.start();
    await vi.waitFor(() => expect(sent).toHaveLength(1), { timeout: 2000 });
    await app.stop();

    expect(sent[0]?.text).toBe("Assalomu alaykum, Vali!");
  });

  it("without loadLocales(), ctx.t() safely falls back to returning the key itself", async () => {
    const update = {
      update_id: 3,
      message: { message_id: 1, date: 0, chat: { id: 3, type: "private" }, text: "/orders" },
    };
    const { fetchImpl, sent } = fakeTelegramBackend([update]);
    const app = new Application(testConfig(), { api: new TelegramApi({ token: "123:test", fetchImpl }) });
    // loadLocales() deliberately NOT called

    app.command("orders", async (ctx) => {
      await ctx.reply(ctx.t("bot.welcome", { name: "X" }));
    });

    await app.start();
    await vi.waitFor(() => expect(sent).toHaveLength(1), { timeout: 2000 });
    await app.stop();

    expect(sent[0]?.text).toBe("bot.welcome");
  });

  it("pressing a localePicker() button persists the choice and answers the callback, without reaching the router", async () => {
    const db = await createTestDatabase();
    await db
      .insertInto("telekit_users")
      .values({
        id: 42,
        first_name: "Ali",
        last_name: null,
        username: null,
        language_code: null,
        locale: null,
        is_premium: 0,
        is_bot: 0,
        status: "active",
        source: null,
        joined_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        messages_count: 0,
        commands_count: 0,
        attributes: "{}",
        banned_at: null,
        banned_reason: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    const kb = localePicker(["ru"]);
    const langButtonData = kb.inline_keyboard[0]![0]!.callback_data!;
    const update = {
      update_id: 4,
      callback_query: {
        id: "cbq1",
        from: { id: 42, is_bot: false, first_name: "Ali" },
        chat_instance: "1",
        data: langButtonData,
        message: { message_id: 1, date: 0, chat: { id: 42, type: "private" } },
      },
    };
    const { fetchImpl, answered } = fakeTelegramBackend([update]);
    const app = new Application(testConfig(), { api: new TelegramApi({ token: "123:test", fetchImpl }), db });
    await loadLocales(app, { cwd: FIXTURES_CWD, dir: "locales", defaultLocale: "uz" });

    let routerReached = false;
    app.event("callback_query", () => {
      routerReached = true;
    });

    await app.start();
    await vi.waitFor(() => expect(answered).toHaveLength(1), { timeout: 2000 });

    const stored = await db.selectFrom("telekit_users").selectAll().where("id", "=", 42).executeTakeFirst();
    await app.stop();

    expect(stored?.locale).toBe("ru");
    expect(routerReached).toBe(false);
  });
});
