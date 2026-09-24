import { installCallbacks } from "@telekit/callbacks";
import { createApplication, loadRoutes, resolveAppKey } from "@telekit/core";
import { MemorySessionStore, sessions } from "@telekit/sessions";
import { increment, reset } from "./app/callbacks/counter.js";
import config from "./telekit.config.js";

const app = createApplication(config);

app.use(sessions({ store: new MemorySessionStore(), key: config.sessions.key, ttl: config.sessions.ttl }));
app.use(
  installCallbacks([increment, reset], {
    key: resolveAppKey(config),
    sigBytes: config.callbacks.sigBytes,
    sign: config.callbacks.sign,
  }),
);

app.onError(async (error, ctx) => {
  ctx.log.error({ err: String(error) }, "Kutilmagan xato");
  if (ctx.chat) {
    await ctx.reply("Kechirasiz, xatolik yuz berdi.").catch(() => {});
  }
});

await loadRoutes(app);
await app.start();
