import { defineCommand } from "@telekit/core";
import { renderCounterKeyboard, renderCounterText } from "../callbacks/counter.js";

export default defineCommand({
  name: "counter",
  description: "Callback + keyboard + session namunasi",

  async handle(ctx) {
    const count = typeof ctx.session?.count === "number" ? ctx.session.count : 0;
    await ctx.reply(renderCounterText(count), { reply_markup: renderCounterKeyboard() });
  },
});
