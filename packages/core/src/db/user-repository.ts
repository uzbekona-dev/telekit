import type { Kysely } from "kysely";
import type { TelekitDatabase, UserStatus } from "./schema.js";

export interface TelekitUser {
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  languageCode: string | null;
  locale: string | null;
  isPremium: boolean;
  isBot: boolean;
  status: UserStatus;
  source: string | null;
  joinedAt: Date;
  lastSeenAt: Date;
  messagesCount: number;
  commandsCount: number;
  attributes: Record<string, unknown>;
  bannedAt: Date | null;
  bannedReason: string | null;
}

/** The subset of Telegram's `User` object the repository actually needs. */
export interface TelegramFromUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: true;
  is_bot: boolean;
}

function toDomain(row: TelekitDatabase["telekit_users"]): TelekitUser {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    username: row.username,
    languageCode: row.language_code,
    locale: row.locale,
    isPremium: Boolean(row.is_premium),
    isBot: Boolean(row.is_bot),
    status: row.status,
    source: row.source,
    joinedAt: new Date(row.joined_at),
    lastSeenAt: new Date(row.last_seen_at),
    messagesCount: row.messages_count,
    commandsCount: row.commands_count,
    attributes: JSON.parse(row.attributes) as Record<string, unknown>,
    bannedAt: row.banned_at ? new Date(row.banned_at) : null,
    bannedReason: row.banned_reason,
  };
}

/** `attributes`/dates stay as DB-native shapes here; `toDomain` is the only place that translates to `TelekitUser` (ADR-002). */
export class UserRepository {
  constructor(private readonly db: Kysely<TelekitDatabase>) {}

  async findById(id: number): Promise<TelekitUser | null> {
    const row = await this.db.selectFrom("telekit_users").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  /**
   * Called by the built-in user-upsert pipeline step on every update that
   * carries a real Telegram user (spec §30.1). First sighting inserts;
   * later sightings only UPDATE when a tracked field actually changed.
   * `last_seen_at` is deliberately NOT touched here — see `touchLastSeen`.
   */
  async upsertFromTelegram(from: TelegramFromUser, source: string | null = null): Promise<TelekitUser> {
    const now = new Date().toISOString();
    const existing = await this.db
      .selectFrom("telekit_users")
      .selectAll()
      .where("id", "=", from.id)
      .executeTakeFirst();

    if (!existing) {
      const row = {
        id: from.id,
        first_name: from.first_name,
        last_name: from.last_name ?? null,
        username: from.username ?? null,
        language_code: from.language_code ?? null,
        locale: null,
        is_premium: from.is_premium ? 1 : 0,
        is_bot: from.is_bot ? 1 : 0,
        status: "active" as const,
        source,
        joined_at: now,
        last_seen_at: now,
        messages_count: 0,
        commands_count: 0,
        attributes: "{}",
        banned_at: null,
        banned_reason: null,
        created_at: now,
        updated_at: now,
      };
      await this.db.insertInto("telekit_users").values(row).execute();
      return toDomain(row);
    }

    const nextFields = {
      first_name: from.first_name,
      last_name: from.last_name ?? null,
      username: from.username ?? null,
      language_code: from.language_code ?? null,
      is_premium: from.is_premium ? 1 : 0,
    };
    const changed =
      existing.first_name !== nextFields.first_name ||
      existing.last_name !== nextFields.last_name ||
      existing.username !== nextFields.username ||
      existing.language_code !== nextFields.language_code ||
      existing.is_premium !== nextFields.is_premium;

    if (!changed) return toDomain(existing);

    const patch = { ...nextFields, updated_at: now };
    await this.db.updateTable("telekit_users").set(patch).where("id", "=", from.id).execute();
    return toDomain({ ...existing, ...patch });
  }

  /** Batched by the caller (spec §30.1) — pass every user id seen since the last flush, at most once per flush interval. */
  async touchLastSeen(ids: readonly number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .updateTable("telekit_users")
      .set({ last_seen_at: new Date().toISOString() })
      .where("id", "in", ids as number[])
      .execute();
  }

  async markBlocked(id: number): Promise<void> {
    await this.db
      .updateTable("telekit_users")
      .set({ status: "blocked", updated_at: new Date().toISOString() })
      .where("id", "=", id)
      .execute();
  }

  async setAttributes(id: number, attributes: Record<string, unknown>): Promise<void> {
    await this.db
      .updateTable("telekit_users")
      .set({ attributes: JSON.stringify(attributes), updated_at: new Date().toISOString() })
      .where("id", "=", id)
      .execute();
  }

  /** Backs the `/lang` picker (spec §26.4) — persists the user's chosen locale so it wins the "user" resolution strategy from then on. */
  async setLocale(id: number, locale: string): Promise<void> {
    await this.db
      .updateTable("telekit_users")
      .set({ locale, updated_at: new Date().toISOString() })
      .where("id", "=", id)
      .execute();
  }
}
