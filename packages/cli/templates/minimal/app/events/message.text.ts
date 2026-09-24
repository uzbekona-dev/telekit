import { defineEvent } from "@telekit/core";

// Har qanday matnli xabarga javob beradi, lekin buyruqlarni (masalan,
// noma'lum /foo) qayta gapirib bermaydi.
export default defineEvent("message:text", async (ctx) => {
  const text = ctx.message?.text ?? "";
  if (text.startsWith("/")) return;

  await ctx.reply(`Siz yozdingiz: ${text}`);
});
