import { defineCommand } from "@telekit/core";

export default defineCommand({
  name: "help",
  description: "Yordam",

  async handle(ctx) {
    await ctx.reply(ctx.t("bot.help"));
  },
});
