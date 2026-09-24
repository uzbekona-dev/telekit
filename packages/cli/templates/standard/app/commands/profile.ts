import { defineCommand } from "@telekit/core";

// ctx.user — telekit_users jadvalidan avtomatik yuklanadi (o'rnatilgan
// userUpsert bosqichi orqali, database.driver="none" bo'lmasa).
export default defineCommand({
  name: "profile",
  description: "Profilingiz",

  async handle(ctx) {
    if (!ctx.user) {
      await ctx.reply("Bu buyruq uchun baza (database) yoqilgan bo'lishi kerak.");
      return;
    }

    await ctx.reply(
      ctx.t("bot.profile.info", {
        id: ctx.user.id,
        name: ctx.user.firstName,
        date: ctx.user.joinedAt.toISOString().slice(0, 10),
      }),
    );
  },
});
