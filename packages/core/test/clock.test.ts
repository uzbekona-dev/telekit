import { describe, expect, it, vi } from "vitest";
import { RealClock, VirtualClock } from "../src/util/clock.js";

describe("RealClock", () => {
  it("now() reports wall-clock time", () => {
    const clock = new RealClock();
    const before = Date.now();
    const now = clock.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it("sleep() waits the requested real duration", async () => {
    vi.useFakeTimers();
    try {
      const clock = new RealClock();
      const resolved = vi.fn();
      const promise = clock.sleep(1000).then(resolved);

      await vi.advanceTimersByTimeAsync(999);
      expect(resolved).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await promise;
      expect(resolved).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("VirtualClock", () => {
  it("starts at virtual time zero and never advances on its own", () => {
    const clock = new VirtualClock();
    expect(clock.now()).toBe(0);
  });

  it("does not resolve sleep() before its deadline is reached", async () => {
    const clock = new VirtualClock();
    const resolved = vi.fn();
    clock.sleep(1000).then(resolved);

    await clock.advance(999);
    expect(resolved).not.toHaveBeenCalled();
  });

  it("resolves sleep() once advance() reaches the deadline", async () => {
    const clock = new VirtualClock();
    const resolved = vi.fn();
    clock.sleep(1000).then(resolved);

    await clock.advance(1000);
    expect(resolved).toHaveBeenCalledOnce();
    expect(clock.now()).toBe(1000);
  });

  it("resolves multiple pending sleeps in deadline order within a single advance()", async () => {
    const clock = new VirtualClock();
    const order: string[] = [];
    clock.sleep(300).then(() => order.push("short"));
    clock.sleep(100).then(() => order.push("shortest"));
    clock.sleep(200).then(() => order.push("mid"));

    await clock.advance(300);
    expect(order).toEqual(["shortest", "mid", "short"]);
  });

  it("settles a sleep chained from an already-resolved sleep within the same advance() — the retry-loop case", async () => {
    const clock = new VirtualClock();
    const order: string[] = [];

    async function retryTwice() {
      await clock.sleep(3000); // e.g. Telegram's retry_after
      order.push("attempt 2");
      await clock.sleep(3000);
      order.push("attempt 3");
    }
    const done = retryTwice();

    await clock.advance(6000);
    await done;

    expect(order).toEqual(["attempt 2", "attempt 3"]);
  });

  it("rejects sleep() when its signal aborts and removes it from the pending queue", async () => {
    const clock = new VirtualClock();
    const controller = new AbortController();
    const promise = clock.sleep(1000, controller.signal);

    controller.abort(new Error("cancelled"));
    await expect(promise).rejects.toThrow("cancelled");

    // Advancing past the original deadline must not resolve the aborted sleep a second time.
    await expect(clock.advance(1000)).resolves.toBeUndefined();
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const clock = new VirtualClock();
    const controller = new AbortController();
    controller.abort(new Error("already gone"));

    await expect(clock.sleep(1000, controller.signal)).rejects.toThrow("already gone");
  });

  it("nextDeadline() reports the earliest parked sleep, or null when nothing waits", async () => {
    const clock = new VirtualClock();
    expect(clock.nextDeadline()).toBeNull();

    void clock.sleep(500);
    void clock.sleep(200);
    expect(clock.nextDeadline()).toBe(200);

    await clock.advance(200);
    expect(clock.nextDeadline()).toBe(500);

    await clock.advance(300);
    expect(clock.nextDeadline()).toBeNull();
  });

  it("starts at the given epoch and measures sleeps from there", async () => {
    const clock = new VirtualClock(1_000_000);
    expect(clock.now()).toBe(1_000_000);

    let woke = false;
    void clock.sleep(50).then(() => {
      woke = true;
    });
    expect(clock.nextDeadline()).toBe(1_000_050);

    await clock.advance(50);
    expect(woke).toBe(true);
    expect(clock.now()).toBe(1_000_050);
  });

  it("concurrent advance() calls never move time backwards", async () => {
    const clock = new VirtualClock();
    // A sleeper that yields a macrotask between wakes keeps both advance() loops
    // interleaving; without the max() guard the shorter one finishes last and
    // rewinds the clock to its own (smaller) target.
    void (async () => {
      for (let i = 0; i < 5; i++) {
        await clock.sleep(10);
        await new Promise((resolve) => setImmediate(resolve));
      }
    })();

    await Promise.all([clock.advance(15), clock.advance(1000)]);

    expect(clock.now()).toBe(1000);
  });
});
