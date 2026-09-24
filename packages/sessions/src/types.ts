export interface SessionRecord {
  data: Record<string, unknown>;
  version: number;
}

/**
 * `save` implements optimistic locking: it must only apply the write if the
 * stored version still matches `expectedVersion`, returning `false` on a
 * mismatch instead of overwriting a concurrent update (spec §19.2).
 */
export interface SessionStore {
  load(key: string): Promise<SessionRecord | null>;
  save(key: string, data: Record<string, unknown>, expectedVersion: number, ttlMs: number | null): Promise<boolean>;
}
