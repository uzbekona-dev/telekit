import type { Kysely } from "kysely";
import { emptyLog, type ConversationLog } from "./log.js";

export type ConversationStatus = "active" | "done" | "cancelled" | "timeout";

export interface ConversationRecord {
  id: string;
  key: string;
  name: string;
  log: ConversationLog;
  checkpointId: string | null;
  checkpointState: unknown;
  /** Failed-validation retries against the *current* pending ask — reset whenever the log advances (ADR-004 `retry`). */
  pendingAttempts: number;
  status: ConversationStatus;
  version: number;
  chatId: number | null;
  userId: number | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export interface ConversationPatch {
  log?: ConversationLog;
  checkpointId?: string | null;
  checkpointState?: unknown;
  pendingAttempts?: number;
  status?: ConversationStatus;
  expiresAt?: Date | null;
}

export interface NewConversation {
  id: string;
  key: string;
  name: string;
  chatId: number | null;
  userId: number | null;
  expiresAt: Date | null;
}

/** Storage backend for active/finished conversations (ADR-004). */
export interface ConversationStore {
  findActive(key: string): Promise<ConversationRecord | null>;
  create(record: NewConversation): Promise<ConversationRecord>;
  /** Optimistic-locked (spec §19.2-style) — `false` means someone else updated this record first; caller should reload and retry or drop the turn. */
  update(id: string, patch: ConversationPatch, expectedVersion: number): Promise<boolean>;
  /** Active conversations whose `expires_at` has passed — driven by `conversations.ttl`/`timeout` (ADR-004). */
  findExpired(now: Date): Promise<ConversationRecord[]>;
}

interface ConversationsTable {
  id: string;
  key: string;
  name: string;
  log: string;
  checkpoint_id: string | null;
  checkpoint_state: string | null;
  pending_attempts: number;
  status: string;
  version: number;
  chat_id: number | null;
  user_id: number | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

interface ConversationsDatabase {
  telekit_conversations: ConversationsTable;
}

function toDomain(row: ConversationsTable): ConversationRecord {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    log: JSON.parse(row.log) as ConversationLog,
    checkpointId: row.checkpoint_id,
    checkpointState: row.checkpoint_state ? (JSON.parse(row.checkpoint_state) as unknown) : undefined,
    pendingAttempts: row.pending_attempts,
    status: row.status as ConversationStatus,
    version: row.version,
    chatId: row.chat_id,
    userId: row.user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
  };
}

export class DatabaseConversationStore implements ConversationStore {
  private readonly db: Kysely<ConversationsDatabase>;

  /**
   * Accepts any `Kysely` instance, not just `Kysely<ConversationsDatabase>`
   * — in practice this is always the app's *main* database (already typed
   * for `telekit_users`/etc. from `@telekit/core`, plus whatever else the
   * project adds), which structurally has more tables than this package
   * alone knows about. Kysely's generics have no clean "at least these
   * tables" bound, so the public constructor widens to `any` rather than
   * forcing every caller to cast — internally it's narrowed right back to
   * `Kysely<ConversationsDatabase>` so every query below still gets full
   * column-name/type checking.
   */
  constructor(db: Kysely<any>) {
    this.db = db as Kysely<ConversationsDatabase>;
  }

  async findActive(key: string): Promise<ConversationRecord | null> {
    const row = await this.db
      .selectFrom("telekit_conversations")
      .selectAll()
      .where("key", "=", key)
      .where("status", "=", "active")
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(record: NewConversation): Promise<ConversationRecord> {
    const now = new Date().toISOString();
    const row: ConversationsTable = {
      id: record.id,
      key: record.key,
      name: record.name,
      log: JSON.stringify(emptyLog()),
      checkpoint_id: null,
      checkpoint_state: null,
      pending_attempts: 0,
      status: "active",
      version: 1,
      chat_id: record.chatId,
      user_id: record.userId,
      created_at: now,
      updated_at: now,
      expires_at: record.expiresAt ? record.expiresAt.toISOString() : null,
    };
    await this.db.insertInto("telekit_conversations").values(row).execute();
    return toDomain(row);
  }

  async update(id: string, patch: ConversationPatch, expectedVersion: number): Promise<boolean> {
    const set: Record<string, unknown> = { updated_at: new Date().toISOString(), version: expectedVersion + 1 };
    if (patch.log !== undefined) set.log = JSON.stringify(patch.log);
    if (patch.checkpointId !== undefined) set.checkpoint_id = patch.checkpointId;
    if (patch.checkpointState !== undefined) {
      set.checkpoint_state = patch.checkpointState === null ? null : JSON.stringify(patch.checkpointState);
    }
    if (patch.pendingAttempts !== undefined) set.pending_attempts = patch.pendingAttempts;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.expiresAt !== undefined) set.expires_at = patch.expiresAt ? patch.expiresAt.toISOString() : null;

    const result = await this.db
      .updateTable("telekit_conversations")
      .set(set)
      .where("id", "=", id)
      .where("version", "=", expectedVersion)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async findExpired(now: Date): Promise<ConversationRecord[]> {
    const rows = await this.db
      .selectFrom("telekit_conversations")
      .selectAll()
      .where("status", "=", "active")
      .where("expires_at", "is not", null)
      .where("expires_at", "<=", now.toISOString())
      .execute();
    return rows.map(toDomain);
  }
}
