import type { Context } from "@telekit/core";
import { describe, expect, it, vi } from "vitest";
import { sessions, SessionConflictError } from "../src/middleware.js";
import { MemorySessionStore } from "../src/memory-store.js";
import type { SessionStore } from "../src/types.js";

function fakeCtx(overrides: Partial<Context> = {}): Context {
  return {
    update: { update_id: 1 },
    state: {},
    ...overrides,
  } as Context;
}

describe("sessions() middleware", () => {
  it("exposes loaded data as ctx.session and persists it when mutated", async () => {
    const store = new MemorySessionStore();
    await store.save("user-chat:1:2", { hits: 1 }, 0, null);
    const mw = sessions({ store });

    const ctx = fakeCtx({ chat: { id: 1, type: "private" }, from: { id: 2, is_bot: false, first_name: "A" } });

    await mw(ctx, async () => {
      expect(ctx.session).toEqual({ hits: 1 });
      (ctx.session as Record<string, unknown>).hits = 2;
    });

    expect(await store.load("user-chat:1:2")).toEqual({ data: { hits: 2 }, version: 2 });
  });

  it("does not write back when the handler never mutates the session", async () => {
    const store = new MemorySessionStore();
    await store.save("user-chat:1:2", { hits: 1 }, 0, null);
    const saveSpy = vi.spyOn(store, "save");
    const mw = sessions({ store });

    const ctx = fakeCtx({ chat: { id: 1, type: "private" }, from: { id: 2, is_bot: false, first_name: "A" } });
    await mw(ctx, async () => {
      void ctx.session?.hits; // read-only access
    });

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("skips sessions entirely when there is no chat to key on", async () => {
    const store = new MemorySessionStore();
    const loadSpy = vi.spyOn(store, "load");
    const mw = sessions({ store });

    const ctx = fakeCtx(); // no chat (e.g. inline_query)
    let ran = false;
    await mw(ctx, async () => {
      ran = true;
      expect(ctx.session).toBeUndefined();
    });

    expect(ran).toBe(true);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('"chat" strategy shares one session across every user in the chat', async () => {
    const store = new MemorySessionStore();
    const mw = sessions({ store, key: "chat" });

    const ctxA = fakeCtx({ chat: { id: 9, type: "group" }, from: { id: 1, is_bot: false, first_name: "A" } });
    await mw(ctxA, async () => {
      (ctxA.session as Record<string, unknown>).seen = "A";
    });

    const ctxB = fakeCtx({ chat: { id: 9, type: "group" }, from: { id: 2, is_bot: false, first_name: "B" } });
    await mw(ctxB, async () => {
      expect(ctxB.session).toEqual({ seen: "A" });
    });
  });

  it("throws SessionConflictError when the store reports a version conflict", async () => {
    const conflictingStore: SessionStore = {
      load: async () => ({ data: {}, version: 0 }),
      save: async () => false,
    };
    const mw = sessions({ store: conflictingStore });
    const ctx = fakeCtx({ chat: { id: 1, type: "private" }, from: { id: 2, is_bot: false, first_name: "A" } });

    await expect(
      mw(ctx, async () => {
        (ctx.session as Record<string, unknown>).x = 1;
      }),
    ).rejects.toBeInstanceOf(SessionConflictError);
  });
});
