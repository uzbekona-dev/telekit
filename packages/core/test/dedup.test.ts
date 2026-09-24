import { describe, expect, it, vi } from "vitest";
import { UpdateDedup } from "../src/pipeline/dedup.js";

describe("UpdateDedup", () => {
  it("flags the same update_id as a duplicate on the second sighting", () => {
    const dedup = new UpdateDedup();
    expect(dedup.isDuplicate(1)).toBe(false);
    expect(dedup.isDuplicate(1)).toBe(true);
    expect(dedup.isDuplicate(2)).toBe(false);
  });

  it("forgets an update_id once its TTL has elapsed", () => {
    vi.useFakeTimers();
    try {
      const dedup = new UpdateDedup(1000);
      expect(dedup.isDuplicate(1)).toBe(false);
      vi.advanceTimersByTime(1500);
      expect(dedup.isDuplicate(1)).toBe(false); // re-seen as new after expiry
    } finally {
      vi.useRealTimers();
    }
  });

  it("evicts the oldest entry once maxSize is exceeded", () => {
    const dedup = new UpdateDedup(5 * 60_000, 3);
    dedup.isDuplicate(1);
    dedup.isDuplicate(2);
    dedup.isDuplicate(3);
    dedup.isDuplicate(4); // should evict update_id 1
    expect(dedup.size).toBe(3);
    expect(dedup.isDuplicate(1)).toBe(false); // 1 was evicted, so it's "new" again
  });
});
