import { randomBytes } from "node:crypto";
import type { Kysely } from "kysely";
import type { TelekitDatabase } from "@telekit/core";
import { base64UrlEncode } from "./base64url.js";

/** Marks a callback_data string as a ref-store lookup rather than an inline-packed payload (ADR-003 "Overflow"). */
export const REF_PREFIX = "!";

/** 96 bits of crypto-random entropy — unguessable enough to stand in for the HMAC signature ref-backed callbacks skip. */
const REF_ID_BYTES = 12;

export interface CallbackRefRecord {
  /** The owning callback's routeId — resolved against the same registry as inline callbacks. */
  route: string;
  payload: Uint8Array;
  chatId?: number;
  userId?: number;
}

/** Storage backend for callback payloads too large for the 37-byte inline budget (ADR-003 "Overflow"). */
export interface CallbackRefStore {
  /** Returns the bare ref id (no `!` prefix) — callers assemble the wire string. */
  save(record: CallbackRefRecord, ttlMs: number): Promise<string>;
  /** `null` for an unknown or expired ref — callers treat this the same as an unknown routeId (stale button). */
  load(refId: string): Promise<CallbackRefRecord | null>;
}

function generateRefId(): string {
  return base64UrlEncode(randomBytes(REF_ID_BYTES));
}

/**
 * `telekit_callback_refs`-backed store (spec ADR-003). Expiry is enforced
 * lazily on `load` — same trade-off as `MemorySessionStore`'s TTL — rather
 * than a background sweep job, which is a v0.5 Scheduler concern.
 */
export class DatabaseCallbackRefStore implements CallbackRefStore {
  constructor(private readonly db: Kysely<TelekitDatabase>) {}

  async save(record: CallbackRefRecord, ttlMs: number): Promise<string> {
    const id = generateRefId();
    const now = Date.now();
    await this.db
      .insertInto("telekit_callback_refs")
      .values({
        id,
        route: record.route,
        payload: Buffer.from(record.payload),
        chat_id: record.chatId ?? null,
        user_id: record.userId ?? null,
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + ttlMs).toISOString(),
      })
      .execute();
    return id;
  }

  async load(refId: string): Promise<CallbackRefRecord | null> {
    const row = await this.db
      .selectFrom("telekit_callback_refs")
      .selectAll()
      .where("id", "=", refId)
      .executeTakeFirst();
    if (!row) return null;

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await this.db.deleteFrom("telekit_callback_refs").where("id", "=", refId).execute();
      return null;
    }

    return {
      route: row.route,
      payload: new Uint8Array(row.payload),
      chatId: row.chat_id ?? undefined,
      userId: row.user_id ?? undefined,
    };
  }
}
