import path from "node:path";
import { fileURLToPath } from "node:url";
import type { InlineQueryResult, Update } from "@telekit/types";
import { describe, expect, it, vi } from "vitest";
import { Application } from "../src/application.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { createContext, extractFrom, type Context } from "../src/context.js";
import { INLINE_LIMITS, assertInlineResults, inlinePage, inlineResult } from "../src/inline.js";
import { keyboard, btn } from "../src/keyboard.js";
import { loadRoutes } from "../src/loader.js";
import { createLogger } from "../src/logger.js";
import { Router } from "../src/router.js";
import type { TelegramApi } from "../src/telegram/client.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const user = { id: 7, is_bot: false, first_name: "Ali" };

function inlineUpdate(query: string, offset = ""): Update {
  return { update_id: 1, inline_query: { id: "iq-1", from: user, query, offset } };
}

function contextFor(update: Update, api: Partial<TelegramApi> = {}): Context {
  return createContext(update, {
    api: api as TelegramApi,
    log: createLogger({ level: "fatal", sink: () => {} }),
    locale: "uz",
    t: (key) => key,
  });
}

function articles(count: number): InlineQueryResult[] {
  return Array.from({ length: count }, (_, i) => inlineResult.article(`a${i}`, `T${i}`, `text ${i}`));
}

describe("inlineResult builders", () => {
  it("article() wraps the text as input_message_content and keeps optional fields off unless given", () => {
    expect(inlineResult.article("1", "Salom", "Salom dunyo")).toEqual({
      type: "article",
      id: "1",
      title: "Salom",
      input_message_content: { message_text: "Salom dunyo" },
    });

    const markup = keyboard().row(btn.url("Sayt", "https://example.com"));
    expect(
      inlineResult.article("2", "B", "<b>B</b>", { description: "tavsif", parse_mode: "HTML", disablePreview: true, reply_markup: markup }),
    ).toEqual({
      type: "article",
      id: "2",
      title: "B",
      description: "tavsif",
      reply_markup: markup,
      input_message_content: { message_text: "<b>B</b>", parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    });
  });

  it("photo(), cachedPhoto(), cachedDocument() and cachedSticker() build their result types", () => {
    expect(inlineResult.photo("p", "https://x/a.jpg")).toEqual({
      type: "photo",
      id: "p",
      photo_url: "https://x/a.jpg",
      thumbnail_url: "https://x/a.jpg",
    });
    expect(inlineResult.photo("p2", "https://x/a.jpg", { thumbnailUrl: "https://x/t.jpg", caption: "c" })).toMatchObject({
      thumbnail_url: "https://x/t.jpg",
      caption: "c",
    });
    expect(inlineResult.cachedPhoto("c1", "FILE")).toEqual({ type: "photo", id: "c1", photo_file_id: "FILE" });
    expect(inlineResult.cachedDocument("d1", "Hisobot", "DOC", { caption: "pdf" })).toEqual({
      type: "document",
      id: "d1",
      title: "Hisobot",
      document_file_id: "DOC",
      caption: "pdf",
    });
    expect(inlineResult.cachedSticker("s1", "STK")).toEqual({ type: "sticker", id: "s1", sticker_file_id: "STK" });
  });
});

describe("assertInlineResults", () => {
  it("accepts up to 50 results with unique 1–64 byte ids", () => {
    expect(() => assertInlineResults(articles(INLINE_LIMITS.maxResults))).not.toThrow();
    expect(() => assertInlineResults([inlineResult.article("x".repeat(64), "t", "t")])).not.toThrow();
  });

  it("rejects too many results, bad ids and duplicates before Telegram does", () => {
    expect(() => assertInlineResults(articles(51))).toThrow(/51 ta natija.*50/);
    expect(() => assertInlineResults([inlineResult.article("", "t", "t")])).toThrow(/1–64 bayt/);
    expect(() => assertInlineResults([inlineResult.article("ы".repeat(33), "t", "t")])).toThrow(/66 bayt/);
    expect(() => assertInlineResults([inlineResult.article("a", "t", "t"), inlineResult.article("a", "u", "u")])).toThrow(/"a" id'si takrorlangan/);
  });
});

describe("inlinePage", () => {
  const items = Array.from({ length: 7 }, (_, i) => i);

  it("walks the list page by page via next_offset", () => {
    expect(inlinePage(items, "", 3)).toEqual({ items: [0, 1, 2], nextOffset: "3" });
    expect(inlinePage(items, "3", 3)).toEqual({ items: [3, 4, 5], nextOffset: "6" });
    expect(inlinePage(items, "6", 3)).toEqual({ items: [6], nextOffset: "" });
  });

  it("ends paging past the end and restarts on a garbage offset", () => {
    expect(inlinePage(items, "99", 3)).toEqual({ items: [], nextOffset: "" });
    expect(inlinePage(items, "-3", 3)).toEqual({ items: [0, 1, 2], nextOffset: "3" });
    expect(inlinePage(items, "abc", 3).items).toEqual([0, 1, 2]);
  });

  it("clamps the page size to 1..50", () => {
    const many = Array.from({ length: 120 }, (_, i) => i);
    expect(inlinePage(many, "").items).toHaveLength(50);
    expect(inlinePage(many, "", 500).items).toHaveLength(50);
    expect(inlinePage(many, "", 0).items).toEqual([0]);
  });
});

describe("ctx.inlineQuery / ctx.answerInline()", () => {
  it("answers the current query with its id, after validating the results", async () => {
    const answerInlineQuery = vi.fn(async () => true as const);
    const ctx = contextFor(inlineUpdate("salom"), { answerInlineQuery });

    expect(ctx.inlineQuery?.query).toBe("salom");
    await ctx.answerInline(articles(2), { cache_time: 0, is_personal: true, next_offset: "2" });

    expect(answerInlineQuery).toHaveBeenCalledWith({
      inline_query_id: "iq-1",
      results: articles(2),
      cache_time: 0,
      is_personal: true,
      next_offset: "2",
    });
    await expect(ctx.answerInline(articles(51))).rejects.toThrow(/51 ta natija/);
    expect(answerInlineQuery).toHaveBeenCalledTimes(1);
  });

  it("refuses to answer anything but an inline query", async () => {
    const ctx = contextFor({ update_id: 2, message: { message_id: 1, date: 0, chat: { id: 7, type: "private" }, text: "x" } });
    await expect(ctx.answerInline([])).rejects.toThrow("faqat inline_query");
  });

  it("exposes chosen inline results and attributes them to their user", () => {
    const update: Update = { update_id: 3, chosen_inline_result: { result_id: "r1", from: user, query: "q" } };
    expect(contextFor(update).chosenInlineResult?.result_id).toBe("r1");
    expect(extractFrom(update)?.id).toBe(7);
  });
});

describe("inline routing", () => {
  function route(router: Router, query: string): Promise<{ handled: boolean; ctx: Context }> {
    const ctx = contextFor(inlineUpdate(query));
    return router.dispatch(ctx).then((handled) => ({ handled, ctx }));
  }

  it("tries every handler with a `match` before the fallback, whatever the registration order", async () => {
    const router = new Router();
    const seen: string[] = [];
    router.registerInline({ handle: (_ctx, q) => void seen.push(`default:${q}`) });
    router.registerInline({ match: "GIF ", handle: (_ctx, q) => void seen.push(`gif:${q}`) });
    router.registerInline({ match: /^(\d+)\s*\+\s*(\d+)$/g, handle: (_ctx, q, m) => void seen.push(`sum:${Number(m![1]) + Number(m![2])}:${q}`) });

    await route(router, "gif  cats ");
    await route(router, "2+3");
    await route(router, "2+3"); // a /g regex must not remember lastIndex between queries
    await route(router, "salom");

    expect(seen).toEqual(["gif:cats", "sum:5:2+3", "sum:5:2+3", "default:salom"]);
    expect(router.listInline().map((d) => d.match ?? null)).toEqual(["GIF ", /^(\d+)\s*\+\s*(\d+)$/g, null]);
  });

  it("falls back to inline_query events when no inline handler matches, and runs route middleware", async () => {
    const router = new Router();
    const order: string[] = [];
    router.registerInline({
      match: "only ",
      middleware: [
        async (_ctx, next) => {
          order.push("mw");
          await next();
        },
      ],
      handle: () => void order.push("inline"),
    });
    router.registerEvent({ type: "inline_query", handle: () => void order.push("event") });

    await route(router, "only this");
    await route(router, "boshqa");

    expect(order).toEqual(["mw", "inline", "event"]);
    expect((await route(new Router(), "x")).handled).toBe(false);
  });

  it("app.inline() registers fallbacks and matched handlers", () => {
    const app = new Application({ ...DEFAULT_CONFIG, bot: { ...DEFAULT_CONFIG.bot, token: "1:a" }, database: { driver: "none", file: "", url: null } });
    const handler = vi.fn();

    app.inline(handler).inline("gif ", handler).inline(/^x/, handler, { middleware: [] });

    expect(app.router.listInline().map((d) => d.match ?? "fallback")).toEqual(["gif ", /^x/, "fallback"]);
  });

  it("loadRoutes() registers app/inline files, skipping _-prefixed files and invalid `match` values", async () => {
    const app = new Application({ ...DEFAULT_CONFIG, bot: { ...DEFAULT_CONFIG.bot, token: "1:a" }, database: { driver: "none", file: "", url: null } });

    const result = await loadRoutes(app, { cwd: path.join(FIXTURES, "nonexistent"), inlineDir: path.join(FIXTURES, "loader-inline") });

    expect(result).toEqual({ commands: 0, events: 0, inline: 2 });
    const { ctx } = await route(app.router, "gif cats");
    expect(ctx.state.inline).toBe("gif:cats");
    expect((await route(app.router, "hello")).ctx.state.inline).toBe("default:hello");
  });
});
