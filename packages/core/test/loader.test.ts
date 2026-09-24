import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Application } from "../src/application.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { loadRoutes } from "../src/loader.js";
import { TelegramApi } from "../src/telegram/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");

function silentApi(): TelegramApi {
  return new TelegramApi({
    token: "123:test",
    fetchImpl: (async () => ({ json: async () => ({ ok: true, result: {} }) })) as unknown as typeof fetch,
  });
}

describe("loadRoutes", () => {
  it("registers commands and events from disk, skipping _-prefixed and .test. files", async () => {
    const app = new Application(
      { ...DEFAULT_CONFIG, bot: { ...DEFAULT_CONFIG.bot, token: "123:test" } },
      { api: silentApi() },
    );

    const result = await loadRoutes(app, {
      commandsDir: path.join(FIXTURES, "loader-commands"),
      eventsDir: path.join(FIXTURES, "loader-events"),
    });

    expect(result.commands).toBe(1);
    expect(result.events).toBe(1);
    expect(app.router.listCommands().map((c) => c.name)).toEqual(["ping"]);
  });

  it("returns zeros without throwing when the directories don't exist", async () => {
    const app = new Application(
      { ...DEFAULT_CONFIG, bot: { ...DEFAULT_CONFIG.bot, token: "123:test" } },
      { api: silentApi() },
    );

    const result = await loadRoutes(app, {
      commandsDir: path.join(FIXTURES, "does-not-exist"),
      eventsDir: path.join(FIXTURES, "also-missing"),
    });

    expect(result).toEqual({ commands: 0, events: 0, inline: 0 });
  });
});
