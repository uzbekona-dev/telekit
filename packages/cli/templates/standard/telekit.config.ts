import { createConversationsMigrationProvider } from "@telekit/conversations";
import { defineConfig, env } from "@telekit/core";

export default defineConfig({
  app: {
    name: env("APP_NAME", "__PROJECT_NAME__"),
    env: env.enum("APP_ENV", ["development", "production", "test"], "development"),
    debug: env.bool("APP_DEBUG", true),
    locale: env("APP_LOCALE", "uz"),
    key: env("APP_KEY", ""),
  },

  bot: {
    token: env("BOT_TOKEN"),
    mode: env.enum("BOT_MODE", ["auto", "polling", "webhook"], "auto"),
  },

  // Production webhook: set PUBLIC_URL (https://...) and BOT_MODE=auto (or "webhook").
  webhook: {
    url: env("PUBLIC_URL", "") || null,
  },

  database: {
    driver: env.enum("DATABASE_DRIVER", ["sqlite", "postgres", "none"], "sqlite"),
    file: env("DATABASE_FILE", "storage/telekit.sqlite"),
    url: env("DATABASE_URL", "") || null,
    // Other @telekit packages' tables — applied automatically in development,
    // and by `telekit migrate` in production (the app itself never migrates there).
    migrations: { providers: [createConversationsMigrationProvider] },
  },

  // Backs ctx.session — see app/callbacks/counter.ts for a full example.
  sessions: {
    store: "memory",
  },

  logging: {
    level: env.enum("LOG_LEVEL", ["trace", "debug", "info", "warn", "error", "fatal"], "info"),
    pretty: env.bool("LOG_PRETTY", true),
  },
});
