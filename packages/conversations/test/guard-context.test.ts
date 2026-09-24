import type { Context } from "@telekit/core";
import { describe, expect, it, vi } from "vitest";
import { guardContext } from "../src/define-conversation.js";
import { ConversationSideEffectError } from "../src/errors.js";

function fakeCtx(): Context {
  return {
    update: { update_id: 1 },
    state: {},
    locale: "uz",
    t: (key: string) => key,
    log: { trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child(): any { return this; } } as any,
    api: { sendMessage: vi.fn(), getMe: vi.fn() } as any,
    reply: vi.fn(),
    editText: vi.fn(),
    deleteMessage: vi.fn(),
    answerCallback: vi.fn(),
    answerInline: vi.fn(),
    replyWithPhoto: vi.fn(),
    replyWithDocument: vi.fn(),
    replyWithVideo: vi.fn(),
    replyWithAudio: vi.fn(),
    replyWithMediaGroup: vi.fn(),
    download: vi.fn(),
  } as Context;
}

describe("guardContext (ADR-004 determinism guard)", () => {
  it("throws ConversationSideEffectError on ctx.reply()", () => {
    const guarded = guardContext(fakeCtx());
    expect(() => guarded.reply("hi")).toThrow(ConversationSideEffectError);
  });

  it("throws on ctx.editText()/deleteMessage()/answerCallback()/answerInline()", () => {
    const guarded = guardContext(fakeCtx());
    expect(() => guarded.editText("hi")).toThrow(ConversationSideEffectError);
    expect(() => guarded.deleteMessage()).toThrow(ConversationSideEffectError);
    expect(() => guarded.answerCallback()).toThrow(ConversationSideEffectError);
    expect(() => guarded.answerInline([])).toThrow(ConversationSideEffectError);
  });

  it("throws ConversationSideEffectError on the media send/download methods (spec §27)", () => {
    const guarded = guardContext(fakeCtx());
    expect(() => guarded.replyWithPhoto("file_id")).toThrow(ConversationSideEffectError);
    expect(() => guarded.replyWithDocument("file_id")).toThrow(ConversationSideEffectError);
    expect(() => guarded.replyWithVideo("file_id")).toThrow(ConversationSideEffectError);
    expect(() => guarded.replyWithAudio("file_id")).toThrow(ConversationSideEffectError);
    expect(() => guarded.replyWithMediaGroup([])).toThrow(ConversationSideEffectError);
    expect(() => guarded.download("file_id")).toThrow(ConversationSideEffectError);
  });

  it("throws on any ctx.api.* method access", () => {
    const guarded = guardContext(fakeCtx());
    expect(() => guarded.api.sendMessage({ chat_id: 1, text: "hi" } as any)).toThrow(ConversationSideEffectError);
    expect(() => guarded.api.getMe()).toThrow(ConversationSideEffectError);
  });

  it("leaves read-only fields (update, chat, from, log) untouched", () => {
    const original = fakeCtx();
    const guarded = guardContext(original);
    expect(guarded.update).toBe(original.update);
    expect(guarded.log).toBe(original.log);
  });

  it("does not mutate the original ctx", () => {
    const original = fakeCtx();
    guardContext(original);
    expect(() => original.reply("still works")).not.toThrow();
  });
});
