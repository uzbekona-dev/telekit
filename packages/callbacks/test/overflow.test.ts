import type { CallbackQuery, Chat, Context, User } from "@telekit/core";
import type { Kysely } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TelekitDatabase } from "@telekit/core";
import { defineCallback } from "../src/callback.js";
import { installCallbacks } from "../src/install.js";
import { DatabaseCallbackRefStore } from "../src/ref-store.js";
import { str, uint } from "../src/schema.js";
import { CallbackOverflowError } from "../src/wire.js";
import { createTestDatabase } from "./helpers/test-db.js";

const KEY = Buffer.from("a".repeat(32));

function fakeUser(id: number): User {
  return { id, is_bot: false, first_name: "Test" };
}

function fakeChat(id: number): Chat {
  return { id, type: "private" };
}

function fakeCtx(overrides: Partial<Context> = {}): Context {
  return {
    update: { update_id: 1 },
    state: {},
    log: { trace() {}, debug() {}, info() {}, warn: vi.fn(), error() {}, fatal() {}, child: () => fakeCtx().log },
    answerCallback: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as Context;
}

function fakeCallbackCtx(callback: CallbackQuery, overrides: Partial<Context> = {}): Context {
  return fakeCtx({ callback, from: callback.from, chat: callback.message?.chat, ...overrides });
}

// A note whose packed payload comfortably exceeds MAX_INLINE_PAYLOAD_BYTES (37).
const LONG_NOTE = "a".repeat(60);

describe("callback overflow → ref store", () => {
  let db: Kysely<TelekitDatabase>;

  afterEach(async () => {
    await db?.destroy();
  });

  it("the plain callable still throws CallbackOverflowError for an oversized payload", () => {
    const addNote = defineCallback({ name: "order.note", schema: { note: str(120) }, handle: () => {} });
    installCallbacks([addNote], { key: KEY });

    expect(() => addNote({ note: LONG_NOTE })).toThrow(CallbackOverflowError);
  });

  it("encodeRef() stores the payload and returns a '!'-prefixed wire string", async () => {
    db = await createTestDatabase();
    const store = new DatabaseCallbackRefStore(db);
    const addNote = defineCallback({ name: "order.note", schema: { note: str(120) }, handle: () => {} });
    installCallbacks([addNote], { key: KEY });

    const raw = await addNote.encodeRef(store, { note: LONG_NOTE });

    expect(raw.startsWith("!")).toBe(true);
    expect(raw.length).toBeLessThanOrEqual(20);
  });

  it("installCallbacks with a refStore dispatches a ref-encoded overflow callback to its handle", async () => {
    db = await createTestDatabase();
    const store = new DatabaseCallbackRefStore(db);
    const handle = vi.fn();
    const addNote = defineCallback({ name: "order.note", schema: { note: str(120) }, handle });
    const middleware = installCallbacks([addNote], { key: KEY, refStore: store });

    const raw = await addNote.encodeRef(store, { note: LONG_NOTE });
    const ctx = fakeCallbackCtx({ id: "q1", from: fakeUser(1), chat_instance: "1", data: raw });
    await middleware(ctx, vi.fn());

    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle.mock.calls[0]![1]).toEqual({ note: LONG_NOTE });
  });

  it("rejects a ref callback when no refStore was installed", async () => {
    db = await createTestDatabase();
    const store = new DatabaseCallbackRefStore(db);
    const handle = vi.fn();
    const addNote = defineCallback({ name: "order.note", schema: { note: str(120) }, handle });
    // installed WITHOUT refStore
    const middleware = installCallbacks([addNote], { key: KEY });

    const raw = await addNote.encodeRef(store, { note: LONG_NOTE });
    const ctx = fakeCallbackCtx({ id: "q1", from: fakeUser(1), chat_instance: "1", data: raw });
    await middleware(ctx, vi.fn());

    expect(handle).not.toHaveBeenCalled();
    expect(ctx.answerCallback).toHaveBeenCalledWith(expect.objectContaining({ show_alert: true }));
  });

  it("rejects an expired/unknown ref as a stale button, without dispatching", async () => {
    db = await createTestDatabase();
    const store = new DatabaseCallbackRefStore(db);
    const handle = vi.fn();
    const addNote = defineCallback({ name: "order.note", schema: { note: str(120) }, handle });
    const middleware = installCallbacks([addNote], { key: KEY, refStore: store });

    const ctx = fakeCallbackCtx({ id: "q1", from: fakeUser(1), chat_instance: "1", data: "!does-not-exist" });
    await middleware(ctx, vi.fn());

    expect(handle).not.toHaveBeenCalled();
    expect(ctx.answerCallback).toHaveBeenCalledWith(expect.objectContaining({ show_alert: true }));
  });

  it("enforces user scope for ref-backed callbacks the same as inline ones", async () => {
    db = await createTestDatabase();
    const store = new DatabaseCallbackRefStore(db);
    const handle = vi.fn();
    const addNote = defineCallback({ name: "order.note", scope: "user", schema: { note: str(120) }, handle });
    const middleware = installCallbacks([addNote], { key: KEY, refStore: store });

    const raw = await addNote.encodeRef(store, { note: LONG_NOTE }, 111);
    const ctx = fakeCallbackCtx({ id: "q1", from: fakeUser(222), chat_instance: "1", data: raw });
    await middleware(ctx, vi.fn());

    expect(handle).not.toHaveBeenCalled();
    expect(ctx.answerCallback).toHaveBeenCalled();
  });

  it("enforces chat scope for ref-backed callbacks", async () => {
    db = await createTestDatabase();
    const store = new DatabaseCallbackRefStore(db);
    const handle = vi.fn();
    const addNote = defineCallback({ name: "order.note", scope: "chat", schema: { note: str(120) }, handle });
    const middleware = installCallbacks([addNote], { key: KEY, refStore: store });

    const raw = await addNote.encodeRef(store, { note: LONG_NOTE }, 500);
    const ctx = fakeCallbackCtx({
      id: "q1",
      from: fakeUser(1),
      chat_instance: "1",
      data: raw,
      message: { message_id: 1, date: 0, chat: fakeChat(501) },
    });
    await middleware(ctx, vi.fn());

    expect(handle).not.toHaveBeenCalled();
    expect(ctx.answerCallback).toHaveBeenCalled();
  });

  it("encodeRef() on a user/chat-scope callback without a scopeId throws", async () => {
    db = await createTestDatabase();
    const store = new DatabaseCallbackRefStore(db);
    const addNote = defineCallback({ name: "order.note", scope: "user", schema: { note: str(120) }, handle: () => {} });
    installCallbacks([addNote], { key: KEY, refStore: store });

    await expect(addNote.encodeRef(store, { note: LONG_NOTE })).rejects.toThrow();
  });

  it("small payloads still work fine alongside encodeRef (mixed inline + ref usage)", () => {
    const openCart = defineCallback({ name: "cart.open", schema: { page: uint() }, handle: () => {} });
    installCallbacks([openCart], { key: KEY });

    expect(openCart({ page: 1 })).not.toMatch(/^!/);
  });
});
