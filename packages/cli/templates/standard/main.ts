import { installCallbacks } from "@telekit/callbacks";
import { DatabaseConversationStore, installConversations } from "@telekit/conversations";
import { createApplication, loadLocales, loadRoutes, resolveAppKey } from "@telekit/core";
import { MemorySessionStore, sessions } from "@telekit/sessions";
import { increment, reset } from "./app/callbacks/counter.js";
import register from "./app/conversations/register.js";
import config from "./telekit.config.js";

// The conversations table's migration is declared in telekit.config.ts (database.migrations),
// so `telekit migrate` sees it too.
const app = createApplication(config);

app.use(sessions({ store: new MemorySessionStore(), key: config.sessions.key, ttl: config.sessions.ttl }));
app.use(
  installCallbacks([increment, reset], {
    key: resolveAppKey(config),
    sigBytes: config.callbacks.sigBytes,
    sign: config.callbacks.sign,
  }),
);
if (app.db) {
  app.use(installConversations([register], { store: new DatabaseConversationStore(app.db) }));
}

app.onError(async (error, ctx) => {
  ctx.log.error({ err: String(error) }, "Kutilmagan xato");
  if (ctx.chat) {
    await ctx.reply(ctx.t("errors.unexpected")).catch(() => {});
  }
});

await loadLocales(app);
await loadRoutes(app);
await app.start();
