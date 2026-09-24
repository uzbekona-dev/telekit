import { NOOP_CALLBACK_DATA, type CallbackQuery, type Chat, type Context, type User } from "@telekit/core";
import { describe, expect, it, vi } from "vitest";
import { defineCallback } from "../src/callback.js";
import { installCallbacks } from "../src/install.js";
import { bool, uint } from "../src/schema.js";

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
  return fakeCtx({
    callback,
    from: callback.from,
    chat: callback.message?.chat,
    ...overrides,
  });
}

describe("defineCallback — API shape", () => {
  it("exposes name/routeId/scope/schema before installCallbacks runs", () => {
    const deleteUser = defineCallback({
      name: "user.delete",
      scope: "user",
      schema: { userId: uint(), confirm: bool().default(false) },
      handle: () => {},
    });

    expect(deleteUser.name).toBe("user.delete");
    expect(deleteUser.scope).toBe("user");
    expect(deleteUser.routeId).toHaveLength(4);
  });

  it("throws a clear error if called before installCallbacks() binds a codec", () => {
    const deleteUser = defineCallback({ name: "user.delete", schema: { userId: uint() }, handle: () => {} });
    expect(() => deleteUser({ userId: 1 })).toThrow(/installCallbacks/);
  });

  it("encode()/decode() round-trip once installed", () => {
    const deleteUser = defineCallback({
      name: "user.delete",
      schema: { userId: uint(), confirm: bool() },
      handle: () => {},
    });
    installCallbacks([deleteUser], { key: KEY });

    const raw = deleteUser({ userId: 12, confirm: true });
    expect(deleteUser.decode(raw)).toEqual({ userId: 12, confirm: true });
    expect(deleteUser.encode({ userId: 12, confirm: true })).toBe(raw);
  });
});

describe("installCallbacks() middleware — dispatch", () => {
  it("routes a valid callback_query to its handle with decoded data", async () => {
    const handle = vi.fn();
    const openCart = defineCallback({
      name: "cart.open",
      schema: { page: uint() },
      handle,
    });
    const middleware = installCallbacks([openCart], { key: KEY });

    const raw = openCart({ page: 2 });
    const ctx = fakeCallbackCtx({
      id: "q1",
      from: fakeUser(1),
      chat_instance: "1",
      data: raw,
      message: { message_id: 1, date: 0, chat: fakeChat(1) },
    });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle.mock.calls[0]![1]).toEqual({ page: 2 });
    expect(next).not.toHaveBeenCalled();
  });

  it("runs the callback's own middleware chain before handle", async () => {
    const order: string[] = [];
    const openCart = defineCallback({
      name: "cart.open",
      schema: {},
      middleware: [
        async (_ctx, next) => {
          order.push("mw");
          await next();
        },
      ],
      handle: () => {
        order.push("handle");
      },
    });
    const middleware = installCallbacks([openCart], { key: KEY });

    const raw = openCart({});
    const ctx = fakeCallbackCtx({ id: "q1", from: fakeUser(1), chat_instance: "1", data: raw });
    await middleware(ctx, vi.fn());

    expect(order).toEqual(["mw", "handle"]);
  });

  it("calls next() for updates that are not callback_query presses", async () => {
    const openCart = defineCallback({ name: "cart.open", schema: {}, handle: vi.fn() });
    const middleware = installCallbacks([openCart], { key: KEY });

    const ctx = fakeCtx();
    const next = vi.fn().mockResolvedValue(undefined);
    await middleware(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("answers with a stale-button alert and skips the handler for an unknown routeId", async () => {
    const openCart = defineCallback({ name: "cart.open", schema: {}, handle: vi.fn() });
    const middleware = installCallbacks([openCart], { key: KEY });

    const ctx = fakeCallbackCtx({ id: "q1", from: fakeUser(1), chat_instance: "1", data: "ZZZZ..sig" });
    await middleware(ctx, vi.fn());

    expect(ctx.answerCallback).toHaveBeenCalledWith(expect.objectContaining({ show_alert: true }));
  });

  it("silently acknowledges a paginator noop button without dispatching or alerting", async () => {
    const handle = vi.fn();
    const openCart = defineCallback({ name: "cart.open", schema: {}, handle });
    const middleware = installCallbacks([openCart], { key: KEY });

    const ctx = fakeCallbackCtx({ id: "q1", from: fakeUser(1), chat_instance: "1", data: NOOP_CALLBACK_DATA });
    await middleware(ctx, vi.fn());

    expect(handle).not.toHaveBeenCalled();
    expect(ctx.answerCallback).toHaveBeenCalledWith();
    expect(ctx.answerCallback).not.toHaveBeenCalledWith(expect.objectContaining({ show_alert: true }));
  });

  it("rejects a tampered callback_data and does not run the handler", async () => {
    const handle = vi.fn();
    const openCart = defineCallback({ name: "cart.open", schema: { page: uint() }, handle });
    const middleware = installCallbacks([openCart], { key: KEY });

    const raw = openCart({ page: 1 });
    const [routeId, payload, sig] = raw.split(".");
    const tampered = `${routeId}.${payload}X.${sig}`;

    const ctx = fakeCallbackCtx({ id: "q1", from: fakeUser(1), chat_instance: "1", data: tampered });
    await middleware(ctx, vi.fn());

    expect(handle).not.toHaveBeenCalled();
    expect(ctx.answerCallback).toHaveBeenCalled();
  });

  it("enforces user scope: another user's press is rejected, not dispatched", async () => {
    const handle = vi.fn();
    const removeItem = defineCallback({
      name: "cart.remove",
      scope: "user",
      schema: { itemId: uint() },
      handle,
    });
    const middleware = installCallbacks([removeItem], { key: KEY });

    const raw = removeItem({ itemId: 5 }, 111);
    const ctx = fakeCallbackCtx({ id: "q1", from: fakeUser(222), chat_instance: "1", data: raw });
    await middleware(ctx, vi.fn());

    expect(handle).not.toHaveBeenCalled();
    expect(ctx.answerCallback).toHaveBeenCalled();
  });
});
