import { defineCallback } from "@telekit/callbacks";
import { btn, keyboard } from "@telekit/core";

// Callback + keyboard + session namunasi: bosilganda ctx.session'da
// saqlanadigan hisoblagichni o'zgartiradi.
function renderKeyboard() {
  return keyboard().row(btn.callback("➕ +1", increment({})), btn.callback("🔄 Reset", reset({})));
}

function readCount(session: Record<string, unknown> | undefined): number {
  return typeof session?.count === "number" ? session.count : 0;
}

export const increment = defineCallback({
  name: "counter.increment",
  schema: {},

  async handle(ctx) {
    const count = readCount(ctx.session) + 1;
    if (ctx.session) ctx.session.count = count;
    await ctx.editText(ctx.t("bot.counter.value", { count }), { reply_markup: renderKeyboard() });
    await ctx.answerCallback();
  },
});

export const reset = defineCallback({
  name: "counter.reset",
  schema: {},

  async handle(ctx) {
    if (ctx.session) ctx.session.count = 0;
    await ctx.editText(ctx.t("bot.counter.value", { count: 0 }), { reply_markup: renderKeyboard() });
    await ctx.answerCallback();
  },
});

export { renderKeyboard as renderCounterKeyboard };
