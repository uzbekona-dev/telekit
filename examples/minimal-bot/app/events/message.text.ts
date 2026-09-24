import { defineEvent } from "@telekit/core";

export default defineEvent("message:text", async (ctx) => {
  const text = ctx.message?.text ?? "";
  if (text.startsWith("/")) return;

  await ctx.reply(`Siz yozdingiz: ${text}`);
});
