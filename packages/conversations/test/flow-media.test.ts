import type { Context, Document, PhotoSize, Update } from "@telekit/core";
import { describe, expect, it, vi } from "vitest";
import { FlowController } from "../src/flow.js";
import { emptyLog, type ConversationLog } from "../src/log.js";
import { ConversationPause } from "../src/pause.js";

function fakeCtx(overrides: Partial<Context> = {}): Context {
  return {
    update: { update_id: 1 },
    state: {},
    locale: "uz",
    t: (key: string) => key,
    log: { trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child(): any { return this; } } as any,
    api: {} as any,
    reply: vi.fn().mockResolvedValue({ message_id: 1, date: 0, chat: { id: 1, type: "private" }, text: "" }),
    editText: vi.fn().mockResolvedValue(true),
    deleteMessage: vi.fn().mockResolvedValue(true),
    answerCallback: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as Context;
}

function newController(log: ConversationLog, incomingUpdate: Update | undefined, ctx: Context, pendingAttempts = 0) {
  return new FlowController({ name: "test", log, incomingUpdate, ctx, pendingAttempts, defaultInvalidMessage: "invalid" });
}

function documentUpdate(doc: Partial<Document>): Update {
  return {
    update_id: 2,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: "private" },
      document: { file_id: "doc1", file_unique_id: "u1", ...doc },
    },
  };
}

function photoUpdate(sizes: PhotoSize[]): Update {
  return { update_id: 2, message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, photo: sizes } };
}

function textOnlyUpdate(): Update {
  return { update_id: 2, message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, text: "yo'q faylim" } };
}

async function pauseOf(promise: Promise<unknown>): Promise<ConversationPause> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ConversationPause) return err;
    throw err;
  }
  throw new Error("expected a ConversationPause");
}

describe("FlowController — document()/photo() media validation (spec §27.4)", () => {
  it("rejects an oversized document and sends the default 'errors.file.too_large' message", async () => {
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), documentUpdate({ file_size: 6 * 1024 * 1024 }), ctx);

    await pauseOf(flow.document("Faylni yuboring:", { maxSize: "5MB" }));

    expect(flow.getResult().newEntries).toEqual([]); // rejection never advances the log
    expect(ctx.reply).toHaveBeenCalledWith("errors.file.too_large");
  });

  it("rejects a disallowed mime type with the default 'errors.file.bad_type' message", async () => {
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), documentUpdate({ mime_type: "video/mp4" }), ctx);

    await pauseOf(flow.document("Faylni yuboring:", { mimeTypes: ["application/pdf", "image/*"] }));

    expect(ctx.reply).toHaveBeenCalledWith("errors.file.bad_type");
  });

  it("calls a custom onInvalid(ctx, reason) instead of the default message", async () => {
    const onInvalid = vi.fn().mockResolvedValue(undefined);
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), documentUpdate({ file_size: 6 * 1024 * 1024 }), ctx);

    await pauseOf(flow.document("Faylni yuboring:", { maxSize: "5MB", onInvalid }));

    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(onInvalid).toHaveBeenCalledWith(ctx, "too_large");
    expect(ctx.reply).not.toHaveBeenCalled(); // onInvalid replaces the default reply, doesn't add to it
  });

  it("does not call onInvalid when no document was sent at all (falls back to the plain retry message)", async () => {
    const onInvalid = vi.fn();
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), textOnlyUpdate(), ctx);

    await pauseOf(flow.document("Faylni yuboring:", { maxSize: "5MB", onInvalid }));

    expect(onInvalid).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith("invalid"); // the ask's defaultInvalidMessage
  });

  it("accepts a valid document and advances the log", async () => {
    const ctx = fakeCtx();
    const update = documentUpdate({ file_size: 1024, mime_type: "application/pdf" });
    const flow = newController(emptyLog(), update, ctx);

    const doc = await flow.document("Faylni yuboring:", { maxSize: "5MB", mimeTypes: ["application/pdf"] });

    expect(doc.file_id).toBe("doc1");
    expect(flow.getResult().newEntries).toEqual([{ k: "ask", i: 0, value: doc }]);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("validates photo() against the largest PhotoSize (.at(-1)), not the thumbnail", async () => {
    const ctx = fakeCtx();
    const sizes: PhotoSize[] = [
      { file_id: "small", file_unique_id: "s", width: 90, height: 90, file_size: 2000 },
      { file_id: "large", file_unique_id: "l", width: 1280, height: 1280, file_size: 6 * 1024 * 1024 },
    ];
    const flow = newController(emptyLog(), photoUpdate(sizes), ctx);

    await pauseOf(flow.photo("Rasm yuboring:", { maxSize: "5MB" }));

    expect(ctx.reply).toHaveBeenCalledWith("errors.file.too_large");
  });

  it("accepts a photo whose largest size is within maxSize", async () => {
    const ctx = fakeCtx();
    const sizes: PhotoSize[] = [{ file_id: "only", file_unique_id: "o", width: 800, height: 800, file_size: 2000 }];
    const flow = newController(emptyLog(), photoUpdate(sizes), ctx);

    const result = await flow.photo("Rasm yuboring:", { maxSize: "5MB" });
    expect(result).toBe(sizes);
  });

  it("replays a previously accepted document from the log without touching ctx or re-validating", async () => {
    const ctx = fakeCtx();
    const log: ConversationLog = {
      version: 1,
      entries: [{ k: "ask", i: 0, value: { file_id: "doc1", file_unique_id: "u1", file_size: 1024 } }],
    };
    const flow = newController(log, undefined, ctx);

    const doc = await flow.document("Faylni yuboring:", { maxSize: "5MB" });

    expect(doc.file_id).toBe("doc1");
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("document()/photo() with no options at all behave exactly as before (no validation wiring)", async () => {
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), documentUpdate({}), ctx);

    const doc = await flow.document("Faylni yuboring:");
    expect(doc.file_id).toBe("doc1");
  });
});
