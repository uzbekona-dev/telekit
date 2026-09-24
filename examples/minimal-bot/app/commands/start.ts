import { defineCommand } from "@telekit/core";

export default defineCommand({
  name: "start",
  description: "Botni ishga tushirish",

  async handle(ctx) {
    const name = ctx.from?.first_name;
    await ctx.reply(
      `Assalomu alaykum${name ? ", " + name : ""} 👋\n\n` +
        "Bot muvaffaqiyatli ishga tushdi.\n\n" +
        "Telekit yordamida yaratildi.",
    );
  },
});
