/**
 * In-memory duplicate detector for `update_id` (spec §14.2). Telegram
 * re-delivers an update if the previous webhook response was slow or a
 * poll's offset commit raced — this catches that within one process.
 *
 * Memory-only: safe for a single instance. Multi-instance deployments need
 * a shared store (Redis) instead — see spec §41.1; that adapter is not part
 * of v0.1.
 */
export class UpdateDedup {
  private readonly expiryByUpdateId = new Map<number, number>();

  constructor(
    private readonly ttlMs: number = 5 * 60_000,
    private readonly maxSize: number = 10_000,
  ) {}

  /** Returns true if this update_id was already seen within the TTL window. */
  isDuplicate(updateId: number): boolean {
    this.evictExpired();

    if (this.expiryByUpdateId.has(updateId)) return true;

    this.expiryByUpdateId.set(updateId, Date.now() + this.ttlMs);
    if (this.expiryByUpdateId.size > this.maxSize) {
      const oldestKey = this.expiryByUpdateId.keys().next().value;
      if (oldestKey !== undefined) this.expiryByUpdateId.delete(oldestKey);
    }
    return false;
  }

  private evictExpired(): void {
    const now = Date.now();
    // Map preserves insertion order, which for a TTL-based cache is also
    // expiry order, so a single scan from the front is enough.
    for (const [id, expiresAt] of this.expiryByUpdateId) {
      if (expiresAt > now) break;
      this.expiryByUpdateId.delete(id);
    }
  }

  get size(): number {
    return this.expiryByUpdateId.size;
  }
}
