import { defineCallback } from "@telekit/callbacks";
import { btn, keyboard } from "@telekit/core";

/** Demonstrates keyboard() + defineCallback + ctx.session working together (spec §23–24). */
function renderKeyboard() {
  return keyboard().row(btn.callback("➕ +1", increment({})), btn.callback("🔄 Reset", reset({})));
}

function renderText(count: number): string {
  return `Hisoblagich: ${count}`;
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
    await ctx.editText(renderText(count), { reply_markup: renderKeyboard() });
    await ctx.answerCallback();
  },
});

export const reset = defineCallback({
  name: "counter.reset",
  schema: {},

  async handle(ctx) {
    if (ctx.session) ctx.session.count = 0;
    await ctx.editText(renderText(0), { reply_markup: renderKeyboard() });
    await ctx.answerCallback({ text: "Hisoblagich tozalandi" });
  },
});

export { renderKeyboard as renderCounterKeyboard, renderText as renderCounterText };
