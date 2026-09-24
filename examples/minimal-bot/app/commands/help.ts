import { defineCommand } from "@telekit/core";

export default defineCommand({
  name: "help",
  description: "Yordam",

  async handle(ctx) {
    await ctx.reply("Mavjud buyruqlar:\n\n/start — botni ishga tushirish\n/help — shu xabar");
  },
});
