import { describe, expect, it, vi } from "vitest";
import { Application } from "../src/application.js";
import { DEFAULT_CONFIG, type TelekitConfig } from "../src/config.js";
import { resolveAppKey } from "../src/key.js";
import { TelegramApi } from "../src/telegram/client.js";
import { resolveSecretPath, resolveSecretToken } from "../src/webhook/secret.js";

function fakeResponse(body: unknown): Response {
  return { json: async () => body } as Response;
}

function webhookTestConfig(overrides: Partial<TelekitConfig> = {}): TelekitConfig {
  return {
    ...DEFAULT_CONFIG,
    bot: { ...DEFAULT_CONFIG.bot, token: "123:test", mode: "webhook" },
    app: { ...DEFAULT_CONFIG.app, key: Buffer.from("a".repeat(32)).toString("base64") },
    webhook: { ...DEFAULT_CONFIG.webhook, url: "https://bot.example.com", port: 0, ipAllowlist: false },
    database: { driver: "none", file: "", url: null },
    logging: { level: "error", pretty: false },
    ...overrides,
  };
}

function expectedWebhookUrl(config: TelekitConfig): string {
  const appKey = resolveAppKey(config);
  return `${config.webhook.url}/telegram/webhook/${resolveSecretPath(config.webhook.path, appKey)}`;
}

/** Fakes getMe/setMyCommands/getWebhookInfo/setWebhook — no real network, mirrors application.e2e.test.ts's pattern. */
function fakeTelegramBackend(webhookInfoUrl = "") {
  const setWebhookCalls: Array<Record<string, unknown>> = [];

  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    const body = init?.body ? JSON.parse(init.body as string) : {};

    if (href.endsWith("/getMe")) {
      return fakeResponse({ ok: true, result: { id: 999, is_bot: true, first_name: "Bot", username: "my_test_bot" } });
    }
    if (href.endsWith("/setMyCommands")) return fakeResponse({ ok: true, result: true });
    if (href.endsWith("/getWebhookInfo")) {
      return fakeResponse({ ok: true, result: { url: webhookInfoUrl, has_custom_certificate: false, pending_update_count: 0 } });
    }
    if (href.endsWith("/setWebhook")) {
      setWebhookCalls.push(body);
      return fakeResponse({ ok: true, result: true });
    }
    throw new Error(`Testda kutilmagan chaqiruv: ${href}`);
  }) as unknown as typeof fetch;

  return { fetchImpl, setWebhookCalls };
}

describe("Application webhook mode end-to-end", () => {
  it("calls setWebhook with the derived URL/secret and starts listening", async () => {
    const config = webhookTestConfig();
    const { fetchImpl, setWebhookCalls } = fakeTelegramBackend("");
    const app = new Application(config, { api: new TelegramApi({ token: "123:test", fetchImpl }) });

    await app.start();
    expect(app.webhookPort).toBeGreaterThan(0);
    await app.stop();

    expect(setWebhookCalls).toHaveLength(1);
    expect(setWebhookCalls[0]?.url).toBe(expectedWebhookUrl(config));
    expect(setWebhookCalls[0]?.secret_token).toBe(resolveSecretToken(config.webhook.secretToken, resolveAppKey(config)));
  });

  it("skips the setWebhook call entirely when Telegram already reports the exact same URL (spec §14.7 transition table)", async () => {
    const config = webhookTestConfig();
    const { fetchImpl, setWebhookCalls } = fakeTelegramBackend(expectedWebhookUrl(config));
    const app = new Application(config, { api: new TelegramApi({ token: "123:test", fetchImpl }) });

    await app.start();
    await app.stop();

    expect(setWebhookCalls).toHaveLength(0);
  });

  it("delivers a real HTTP POST to the ingress path through to a registered handler", async () => {
    const config = webhookTestConfig();
    const { fetchImpl } = fakeTelegramBackend("");
    const app = new Application(config, { api: new TelegramApi({ token: "123:test", fetchImpl }) });

    let handled = false;
    app.event("message:text", (ctx) => {
      handled = ctx.message?.text === "hi";
    });

    await app.start();

    const appKey = resolveAppKey(config);
    const path = `/telegram/webhook/${resolveSecretPath(config.webhook.path, appKey)}`;
    const token = resolveSecretToken(config.webhook.secretToken, appKey);

    const res = await fetch(`http://127.0.0.1:${app.webhookPort}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": token },
      body: JSON.stringify({
        update_id: 1,
        message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, text: "hi" },
      }),
    });
    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(handled).toBe(true));
    await app.stop();
  });
});
