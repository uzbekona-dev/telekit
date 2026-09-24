import { VirtualClock } from "@telekit/core";
import { describe, expect, it, vi } from "vitest";
import { MemorySessionStore } from "../src/memory-store.js";

describe("MemorySessionStore", () => {
  it("returns null for a key that was never saved", async () => {
    const store = new MemorySessionStore();
    expect(await store.load("missing")).toBeNull();
  });

  it("round-trips data and increments the version on save", async () => {
    const store = new MemorySessionStore();

    const ok1 = await store.save("k", { count: 1 }, 0, null);
    expect(ok1).toBe(true);

    const loaded = await store.load("k");
    expect(loaded).toEqual({ data: { count: 1 }, version: 1 });

    const ok2 = await store.save("k", { count: 2 }, 1, null);
    expect(ok2).toBe(true);
    expect(await store.load("k")).toEqual({ data: { count: 2 }, version: 2 });
  });

  it("clones nested values so failed middleware cannot mutate stored state by reference", async () => {
    const store = new MemorySessionStore();
    await store.save("k", { nested: { count: 1 } }, 0, null);

    const loaded = await store.load("k");
    (loaded!.data.nested as { count: number }).count = 99;

    expect(await store.load("k")).toEqual({ data: { nested: { count: 1 } }, version: 1 });
  });

  it("rejects a save whose expectedVersion is stale (optimistic lock)", async () => {
    const store = new MemorySessionStore();
    await store.save("k", { count: 1 }, 0, null);

    const stale = await store.save("k", { count: 99 }, 0, null); // should have been version 1
    expect(stale).toBe(false);
    expect(await store.load("k")).toEqual({ data: { count: 1 }, version: 1 });
  });

  it("expires entries past their TTL", async () => {
    vi.useFakeTimers();
    try {
      const store = new MemorySessionStore();
      await store.save("k", { count: 1 }, 0, 1000);
      expect(await store.load("k")).not.toBeNull();

      vi.advanceTimersByTime(1500);
      expect(await store.load("k")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("expires entries against an injected VirtualClock instead of real/faked wall-clock time", async () => {
    const clock = new VirtualClock();
    const store = new MemorySessionStore(clock);

    await store.save("k", { count: 1 }, 0, 1000);
    expect(await store.load("k")).not.toBeNull();

    await clock.advance(999);
    expect(await store.load("k")).not.toBeNull();

    await clock.advance(1);
    expect(await store.load("k")).toBeNull();
  });
});
