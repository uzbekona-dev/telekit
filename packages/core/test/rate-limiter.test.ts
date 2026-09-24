import { describe, expect, it } from "vitest";
import { RateLimitQueueFullError, TelegramRateLimiter } from "../src/telegram/rate-limiter.js";
import { VirtualClock } from "../src/util/clock.js";

describe("TelegramRateLimiter", () => {
  it("allows a burst, then spaces calls for the same chat", async () => {
    const clock = new VirtualClock();
    const limiter = new TelegramRateLimiter({ globalPerSecond: 100, perChatPerSecond: 1, burst: 2 }, clock);

    await limiter.acquire(1);
    await limiter.acquire(1);
    let released = false;
    const third = limiter.acquire(1).then(() => { released = true; });
    await Promise.resolve();
    expect(released).toBe(false);

    await clock.advance(1_000);
    await third;
    expect(released).toBe(true);
  });

  it("keeps per-chat limits independent", async () => {
    const clock = new VirtualClock();
    const limiter = new TelegramRateLimiter({ globalPerSecond: 100, perChatPerSecond: 1, burst: 1 }, clock);

    await limiter.acquire(1);
    const otherChat = limiter.acquire(2);
    await clock.advance(10); // only the global 100/s limit, not chat 1's 1/s limit
    await expect(otherChat).resolves.toBeUndefined();
  });

  it("rejects when the bounded waiting queue is full", async () => {
    const clock = new VirtualClock();
    const limiter = new TelegramRateLimiter({ globalPerSecond: 1, perChatPerSecond: 1, burst: 1, queueLimit: 1 }, clock);
    await limiter.acquire(1);
    const queued = limiter.acquire(1);
    await expect(limiter.acquire(1)).rejects.toBeInstanceOf(RateLimitQueueFullError);
    await clock.advance(1_000);
    await queued;
  });
});
