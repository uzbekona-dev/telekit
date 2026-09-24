import { createApplication, loadRoutes } from "@telekit/core";
import config from "./telekit.config.js";

const app = createApplication(config);

app.onError(async (error, ctx) => {
  ctx.log.error({ err: String(error) }, "Kutilmagan xato");
  if (ctx.chat) {
    await ctx.reply("Kechirasiz, xatolik yuz berdi.").catch(() => {});
  }
});

await loadRoutes(app);
await app.start();
