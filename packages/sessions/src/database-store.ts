import { RealClock, type Clock, type TelekitDatabase } from "@telekit/core";
import type { Kysely } from "kysely";
import type { SessionRecord, SessionStore } from "./types.js";

/** Persists sessions in `telekit_sessions` (spec Appendix C) with optimistic locking via `version`. */
export class DatabaseSessionStore implements SessionStore {
  /** `clock` defaults to `RealClock`; `@telekit/testing`'s `createTestBot()` passes its shared `VirtualClock` so `bot.clock.advance()` can fast-forward TTL expiry in tests. */
  constructor(
    private readonly db: Kysely<TelekitDatabase>,
    private readonly clock: Clock = new RealClock(),
  ) {}

  async load(key: string): Promise<SessionRecord | null> {
    const row = await this.db.selectFrom("telekit_sessions").selectAll().where("key", "=", key).executeTakeFirst();
    if (!row) return null;

    if (row.expires_at && new Date(row.expires_at).getTime() <= this.clock.now()) {
      await this.db.deleteFrom("telekit_sessions").where("key", "=", key).execute();
      return null;
    }
    return { data: JSON.parse(row.data) as Record<string, unknown>, version: row.version };
  }

  async save(
    key: string,
    data: Record<string, unknown>,
    expectedVersion: number,
    ttlMs: number | null,
  ): Promise<boolean> {
    const now = new Date(this.clock.now()).toISOString();
    const expiresAt = ttlMs !== null ? new Date(this.clock.now() + ttlMs).toISOString() : null;
    const json = JSON.stringify(data);

    if (expectedVersion === 0) {
      try {
        await this.db
          .insertInto("telekit_sessions")
          .values({ key, data: json, version: 1, expires_at: expiresAt, updated_at: now })
          .execute();
        return true;
      } catch {
        // Most likely a concurrent first-write to the same key (primary key
        // conflict) — treat it the same as an optimistic-lock miss.
        return false;
      }
    }

    const result = await this.db
      .updateTable("telekit_sessions")
      .set({ data: json, version: expectedVersion + 1, expires_at: expiresAt, updated_at: now })
      .where("key", "=", key)
      .where("version", "=", expectedVersion)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) === 1;
  }
}
