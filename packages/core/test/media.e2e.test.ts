import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Chat } from "@telekit/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createContext, type Context } from "../src/context.js";
import { CaptionTooLongError, TextTooLongError } from "../src/media/errors.js";
import { InputFile } from "../src/media/input-file.js";
import { splitText } from "../src/media/split.js";
import { createLogger } from "../src/logger.js";
import { TelegramApi } from "../src/telegram/client.js";
import { ValidationError } from "../src/errors.js";

function fakeResponse(body: unknown): Response {
  return { json: async () => body } as Response;
}

const CHAT: Chat = { id: 555, type: "private" };

function contextFor(api: TelegramApi): Context {
  return createContext(
    {
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat: CHAT,
        from: { id: 1, is_bot: false, first_name: "Ali" },
        text: "/hi",
      },
    },
    { api, log: createLogger({ level: "error" }), locale: "uz", t: (key) => key },
  );
}

function inlineOnlyContext(api: TelegramApi): Context {
  // No message/callback/chat — mirrors an inline_query update (spec §16's "ctx.reply throws for inline_query").
  return createContext({ update_id: 1, inline_query: { id: "q1", from: { id: 1, is_bot: false, first_name: "A" }, query: "", offset: "" } }, {
    api,
    log: createLogger({ level: "error" }),
    locale: "uz",
    t: (key) => key,
  });
}

describe("Context media (spec §27)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "telekit-ctx-media-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("replyWithPhoto sends a real multipart request carrying the file bytes and caption", async () => {
    const filePath = join(dir, "promo.jpg");
    await writeFile(filePath, "fake-jpeg-bytes");

    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse({ ok: true, result: { message_id: 1, date: 0, chat: CHAT } }),
    );
    const api = new TelegramApi({ token: "123:test", fetchImpl });
    const ctx = contextFor(api);

    await ctx.replyWithPhoto(InputFile.path(filePath), { caption: "salom" });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("chat_id")).toBe("555");
    expect(form.get("caption")).toBe("salom");
    const photoPart = form.get("photo") as Blob;
    expect(await photoPart.text()).toBe("fake-jpeg-bytes");
  });

  it("replyWithPhoto throws CaptionTooLongError (TK2005) before making any network call", async () => {
    const fetchImpl = vi.fn();
    const api = new TelegramApi({ token: "123:test", fetchImpl });
    const ctx = contextFor(api);

    await expect(ctx.replyWithPhoto("file_id_x", { caption: "a".repeat(1025) })).rejects.toThrow(CaptionTooLongError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reply(text) throws TextTooLongError (TK2004) by default when over 4096 chars, with no network call", async () => {
    const fetchImpl = vi.fn();
    const api = new TelegramApi({ token: "123:test", fetchImpl });
    const ctx = contextFor(api);

    await expect(ctx.reply("a".repeat(4097))).rejects.toThrow(TextTooLongError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reply(text, { split: true }) sends ordered chunks matching splitText, and returns the last message", async () => {
    const longText = "Assalomu alaykum! ".repeat(400); // well over 4096 chars
    const expectedParts = splitText(longText);
    expect(expectedParts.length).toBeGreaterThan(1);

    const sentTexts: string[] = [];
    let messageId = 0;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { text: string };
      sentTexts.push(body.text);
      messageId++;
      return fakeResponse({ ok: true, result: { message_id: messageId, date: 0, chat: CHAT, text: body.text } });
    });
    const api = new TelegramApi({ token: "123:test", fetchImpl: fetchImpl as unknown as typeof fetch });
    const ctx = contextFor(api);

    const result = await ctx.reply(longText, { split: true });

    expect(sentTexts).toEqual(expectedParts);
    expect(result.message_id).toBe(expectedParts.length);
  });

  it("replyWithMediaGroup hoists InputFile items into multipart attachments alongside a file_id string item", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ ok: true, result: [{ message_id: 1 }, { message_id: 2 }] }));
    const api = new TelegramApi({ token: "123:test", fetchImpl });
    const ctx = contextFor(api);

    const photo = InputFile.buffer(new TextEncoder().encode("bytes-a"), "a.jpg");
    await ctx.replyWithMediaGroup([
      { type: "photo", media: photo, caption: "Birinchi" },
      { type: "photo", media: "AgACAgIAAxkBAAI..." },
    ]);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/sendMediaGroup");
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    const mediaField = JSON.parse(form.get("media") as string) as Array<{ media: string }>;
    expect(mediaField[0]?.media).toBe("attach://telekit_file_0");
    expect(mediaField[1]?.media).toBe("AgACAgIAAxkBAAI...");
    const attached = form.get("telekit_file_0") as Blob;
    expect(await attached.text()).toBe("bytes-a");
  });

  it("replyWithPhoto/replyWithDocument throw ValidationError (TK2001) when the update has no chat", async () => {
    const api = new TelegramApi({ token: "123:test", fetchImpl: vi.fn() });
    const ctx = inlineOnlyContext(api);

    await expect(ctx.replyWithPhoto("file_id_x")).rejects.toThrow(ValidationError);
    await expect(ctx.replyWithDocument("file_id_x")).rejects.toThrow(ValidationError);
  });
});
