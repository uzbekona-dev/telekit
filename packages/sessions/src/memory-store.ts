import { RealClock, type Clock } from "@telekit/core";
import type { SessionRecord, SessionStore } from "./types.js";

interface Entry {
  data: Record<string, unknown>;
  version: number;
  expiresAt: number | null;
}

function cloneData(data: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(data);
}

/** Single-process only — restart or a second instance loses all sessions (spec §41.1). */
export class MemorySessionStore implements SessionStore {
  private readonly entries = new Map<string, Entry>();

  /** `clock` defaults to `RealClock`; `@telekit/testing`'s `createTestBot()` passes its shared `VirtualClock` so `bot.clock.advance()` can fast-forward TTL expiry in tests. */
  constructor(private readonly clock: Clock = new RealClock()) {}

  async load(key: string): Promise<SessionRecord | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.clock.now()) {
      this.entries.delete(key);
      return null;
    }
    return { data: cloneData(entry.data), version: entry.version };
  }

  async save(
    key: string,
    data: Record<string, unknown>,
    expectedVersion: number,
    ttlMs: number | null,
  ): Promise<boolean> {
    const current = this.entries.get(key);
    const currentVersion = current?.version ?? 0;
    if (currentVersion !== expectedVersion) return false;

    this.entries.set(key, {
      data: cloneData(data),
      version: currentVersion + 1,
      expiresAt: ttlMs !== null ? this.clock.now() + ttlMs : null,
    });
    return true;
  }
}
