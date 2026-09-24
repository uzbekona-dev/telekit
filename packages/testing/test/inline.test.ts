import { inlinePage, inlineResult } from "@telekit/core";
import { afterEach, describe, expect, it } from "vitest";
import { createTestBot, type TestBot } from "../src/index.js";
import "../src/vitest-setup.js";

const CITIES = ["Andijon", "Buxoro", "Farg'ona", "Jizzax", "Namangan", "Navoiy", "Qarshi", "Samarqand", "Termiz", "Toshkent"];

describe("inline mode through createTestBot", () => {
  let bot: TestBot;
  afterEach(async () => {
    await bot.close();
  });

  async function cityBot(): Promise<TestBot> {
    return createTestBot({
      setup: (app) => {
        app.inline("gif ", async (ctx, query) => {
          await ctx.answerInline([inlineResult.cachedPhoto(`gif-${query}`, `FILE_${query}`)]);
        });
        app.inline(async (ctx, query) => {
          const matches = CITIES.filter((c) => c.toLowerCase().includes(query.toLowerCase()));
          const page = inlinePage(matches, ctx.inlineQuery!.offset, 4);
          await ctx.answerInline(
            page.items.map((city) => inlineResult.article(city, city, `📍 ${city}`)),
            { next_offset: page.nextOffset, cache_time: 0 },
          );
        });
        app.event("chosen_inline_result", (ctx) => {
          ctx.state.chosen = ctx.chosenInlineResult?.result_id;
          ctx.log.info({ chosen: ctx.chosenInlineResult?.result_id });
        });
      },
    });
  }

  it("answers a query and pages through the rest with next_offset", async () => {
    bot = await cityBot();

    const first = await bot.inlineQuery("");
    expect(first).toHaveAnsweredInline(4);
    expect(first.inlineAnswer).toMatchObject({ next_offset: "4", cache_time: 0, inline_query_id: expect.any(String) });

    const second = await bot.inlineQuery("", { offset: first.inlineAnswer!.next_offset });
    const third = await bot.inlineQuery("", { offset: second.inlineAnswer!.next_offset });
    expect(third.inlineAnswer?.results.map((r) => r.id)).toEqual(["Termiz", "Toshkent"]);
    expect(third.inlineAnswer?.next_offset).toBe("");
  });

  it("routes prefixed queries to their handler and filters the fallback's results", async () => {
    bot = await cityBot();

    const gif = await bot.inlineQuery("gif mushuk");
    expect(gif.inlineAnswer?.results).toEqual([{ type: "photo", id: "gif-mushuk", photo_file_id: "FILE_mushuk" }]);

    const search = await bot.inlineQuery("SAM", { chatType: "group" });
    expect(search).toHaveAnsweredInline(1);
    expect(search.inlineAnswer?.results[0]).toMatchObject({ id: "Samarqand", input_message_content: { message_text: "📍 Samarqand" } });
  });

  it("delivers the chosen result and upserts the user who picked it", async () => {
    bot = await cityBot();

    const res = await bot.as({ id: 42, first_name: "Vali" }).chosenInlineResult("Toshkent", { query: "tosh", inlineMessageId: "im-1" });

    expect(res.error).toBeUndefined();
    expect(res).not.toHaveAnsweredInline();
    expect(await bot.db?.users.findById(42)).toMatchObject({ firstName: "Vali" });
  });

  it("reports an invalid answer as the handler's error, without calling Telegram", async () => {
    bot = await createTestBot({
      setup: (app) => {
        app.inline(async (ctx) => {
          await ctx.answerInline(Array.from({ length: 60 }, (_, i) => inlineResult.article(`${i}`, "t", "t")));
        });
      },
    });

    const res = await bot.inlineQuery("hammasi");

    expect((res.error as Error).message).toMatch(/60 ta natija/);
    expect(res.apiCalls).toHaveLength(0);
    expect(() => expect(res).toHaveAnsweredInline()).toThrow("answerInlineQuery chaqirilmadi");
  });

  it("toHaveAnsweredInline(n) explains a count mismatch", async () => {
    bot = await cityBot();
    const res = await bot.inlineQuery("");

    expect(() => expect(res).toHaveAnsweredInline(10)).toThrow("10 ta inline natija kutilgan edi, 4 ta yuborildi");
    expect(() => expect(res).not.toHaveAnsweredInline()).toThrow("javob berilmasligi kutilgan edi");
  });
});
