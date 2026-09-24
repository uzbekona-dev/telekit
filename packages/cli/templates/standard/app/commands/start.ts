import { defineCommand } from "@telekit/core";

export default defineCommand({
  name: "start",
  description: "Botni ishga tushirish",

  async handle(ctx) {
    await ctx.reply(ctx.t("bot.welcome", { name: ctx.from?.first_name ?? "" }));
  },
});
