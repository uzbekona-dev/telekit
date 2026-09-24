import { defineConfig, env } from "@telekit/core";

export default defineConfig({
  app: {
    name: env("APP_NAME", "minimal-bot"),
    env: env.enum("APP_ENV", ["development", "production", "test"], "development"),
    debug: env.bool("APP_DEBUG", true),
    locale: env("APP_LOCALE", "uz"),
  },

  bot: {
    token: env("BOT_TOKEN"),
    mode: env.enum("BOT_MODE", ["auto", "polling", "webhook"], "auto"),
  },

  logging: {
    level: env.enum("LOG_LEVEL", ["trace", "debug", "info", "warn", "error", "fatal"], "info"),
    pretty: env.bool("LOG_PRETTY", true),
  },
});
