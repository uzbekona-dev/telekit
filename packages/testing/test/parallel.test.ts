import { afterEach, describe, expect, it } from "vitest";
import { createTestBot, type TestBot } from "../src/index.js";

describe("createTestBot — concurrent dispatches stay isolated", () => {
  let bot: TestBot;
  afterEach(async () => {
    await bot.close();
  });

  it("interleaved updates from different chats keep their own replies, translations and errors", async () => {
    bot = await createTestBot({
      setup: (app) => {
        app.command("slow", async (ctx) => {
          ctx.t("slow.key");
          await new Promise((resolve) => setTimeout(resolve, 20)); // lets "fast" run in between
          await ctx.reply(`slow:${ctx.chat?.id}`);
        });
        app.command("fast", async (ctx) => {
          ctx.t("fast.key");
          await ctx.reply(`fast:${ctx.chat?.id}`);
          throw new Error("fast failed");
        });
      },
    });

    const [slow, fast] = await Promise.all([bot.command("slow"), bot.as({ id: 2 }).command("fast")]);

    expect(slow.replies.map((r) => r.text)).toEqual(["slow:1"]);
    expect(slow.translations.map((t) => t.key)).toEqual(["slow.key"]);
    expect(slow.error).toBeUndefined();
    expect(fast.replies.map((r) => r.text)).toEqual(["fast:2"]);
    expect(fast.translations.map((t) => t.key)).toEqual(["fast.key"]);
    expect((fast.error as Error).message).toBe("fast failed");
    expect(bot.api.calls).toHaveLength(2);
  });

  it("updates for the same chat still run one at a time, each with its own result", async () => {
    const order: string[] = [];
    bot = await createTestBot({
      setup: (app) => {
        app.event("message:text", async (ctx) => {
          order.push(`start:${ctx.message?.text}`);
          await new Promise((resolve) => setTimeout(resolve, 5));
          await ctx.reply(`echo:${ctx.message?.text}`);
          order.push(`end:${ctx.message?.text}`);
        });
      },
    });

    const results = await Promise.all([bot.message("a"), bot.message("b"), bot.message("c")]);

    expect(results.map((r) => r.replies.map((m) => m.text))).toEqual([["echo:a"], ["echo:b"], ["echo:c"]]);
    expect(order).toEqual(["start:a", "end:a", "start:b", "end:b", "start:c", "end:c"]);
  });

  it("concurrent 429 retries share one virtual clock without racing it", async () => {
    bot = await createTestBot({
      setup: (app) => {
        app.command("start", async (ctx) => {
          await ctx.reply(`salom ${ctx.chat?.id}`);
        });
      },
    });
    bot.api.mock("sendMessage", { error: { error_code: 429, parameters: { retry_after: 3 } } }, { times: 2 });
    const startedAt = bot.clock.now();

    const results = await Promise.all([1, 2, 3].map((id) => bot.as({ id }).command("start")));

    for (const [index, res] of results.entries()) {
      expect(res).toHaveProperty("error", undefined);
      expect(res.replies.map((r) => r.text)).toEqual([`salom ${index + 1}`]);
    }
    const attempts = results.map((r) => r.apiCalls.length).sort();
    expect(attempts).toEqual([1, 2, 2]);
    expect(bot.clock.now() - startedAt).toBe(3000);
  });
});
