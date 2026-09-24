import { defineCommand, localePicker } from "@telekit/core";

// Til tanlash — framework tayyor komponenti. Tanlov bosilganda Telekit
// avtomatik telekit_users.locale ga yozadi, markaziy handler kerak emas
// (spec §26.4).
export default defineCommand({
  name: "lang",
  description: "Tilni tanlash",

  async handle(ctx) {
    await ctx.reply(ctx.t("bot.lang.choose"), {
      reply_markup: localePicker(["uz", "ru", "en"]),
    });
  },
});
