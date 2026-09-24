import { defineConversation } from "@telekit/conversations";

// Ko'p qadamli dialog namunasi — har bir flow.* chaqiruvi javobni kutadi va
// suhbat holati bazada saqlanadi, shuning uchun bot qayta ishga tushsa ham
// foydalanuvchi javobidan davom etaveradi.
export default defineConversation(
  "register",
  async (flow, ctx) => {
    const name = await flow.text(ctx.t("register.ask_name"));

    const age = await flow.number(ctx.t("register.ask_age"), {
      min: 14,
      max: 100,
      retry: 3,
      invalidMessage: ctx.t("register.invalid_age"),
    });

    const confirmed = await flow.confirm(ctx.t("register.confirm", { name, age }));
    if (!confirmed) {
      await flow.reply(ctx.t("register.restarted"));
      return flow.restart();
    }

    await flow.reply(ctx.t("register.done", { name, age }));
  },
  {
    cancelCommands: ["/cancel"],
    timeout: "15m",
    onCancel: async (flow) => flow.reply("Bekor qilindi."),
    onTimeout: async (flow) => flow.reply("Vaqt tugadi — qaytadan /register yozing."),
  },
);
