import type { Kysely } from "kysely";
import type { Migration, MigrationProvider } from "kysely/migration";

export type DatabaseDriver = "sqlite" | "postgres";

/**
 * `blob` is SQLite's binary column type name; Postgres calls the same
 * concept `bytea`. Every other column type used below (`text`, `integer`,
 * `bigint`) is spelled identically on both dialects, so this is the only
 * type that needs picking per-driver.
 */
function blobType(dialect: DatabaseDriver): "blob" | "bytea" {
  return dialect === "postgres" ? "bytea" : "blob";
}

/**
 * Builds the framework's migrations for a given driver. `bigint` (not
 * `integer`) for every Telegram-id-bearing column: SQLite gives `bigint` the
 * same dynamic-width INTEGER affinity as `integer` (no behavior change
 * there), but Postgres's `integer` is a true 4-byte type that overflows on
 * real Telegram user ids (e.g. `8790370872` > 2^31) — `bigint` is required
 * for correctness on that dialect, and is a safe no-op on the other.
 */
function buildMigrations(dialect: DatabaseDriver): Record<string, Migration> {
  return {
    "0001_create_telekit_users": {
      async up(db: Kysely<any>) {
        await db.schema
          .createTable("telekit_users")
          .addColumn("id", "bigint", (c) => c.primaryKey())
          .addColumn("first_name", "text", (c) => c.notNull())
          .addColumn("last_name", "text")
          .addColumn("username", "text")
          .addColumn("language_code", "text")
          .addColumn("locale", "text")
          .addColumn("is_premium", "integer", (c) => c.notNull().defaultTo(0))
          .addColumn("is_bot", "integer", (c) => c.notNull().defaultTo(0))
          .addColumn("status", "text", (c) => c.notNull().defaultTo("active"))
          .addColumn("source", "text")
          .addColumn("joined_at", "text", (c) => c.notNull())
          .addColumn("last_seen_at", "text", (c) => c.notNull())
          .addColumn("messages_count", "integer", (c) => c.notNull().defaultTo(0))
          .addColumn("commands_count", "integer", (c) => c.notNull().defaultTo(0))
          .addColumn("attributes", "text", (c) => c.notNull().defaultTo("{}"))
          .addColumn("banned_at", "text")
          .addColumn("banned_reason", "text")
          .addColumn("created_at", "text", (c) => c.notNull())
          .addColumn("updated_at", "text", (c) => c.notNull())
          .execute();

        await db.schema.createIndex("idx_users_status").on("telekit_users").column("status").execute();
        await db.schema.createIndex("idx_users_last_seen").on("telekit_users").column("last_seen_at").execute();
      },
      async down(db: Kysely<any>) {
        await db.schema.dropTable("telekit_users").execute();
      },
    },

    "0002_create_telekit_sessions": {
      async up(db: Kysely<any>) {
        await db.schema
          .createTable("telekit_sessions")
          .addColumn("key", "text", (c) => c.primaryKey())
          .addColumn("data", "text", (c) => c.notNull())
          .addColumn("version", "integer", (c) => c.notNull().defaultTo(1))
          .addColumn("expires_at", "text")
          .addColumn("updated_at", "text", (c) => c.notNull())
          .execute();

        await db.schema.createIndex("idx_sessions_expires").on("telekit_sessions").column("expires_at").execute();
      },
      async down(db: Kysely<any>) {
        await db.schema.dropTable("telekit_sessions").execute();
      },
    },

    "0003_create_telekit_callback_refs": {
      async up(db: Kysely<any>) {
        await db.schema
          .createTable("telekit_callback_refs")
          .addColumn("id", "text", (c) => c.primaryKey())
          .addColumn("route", "text", (c) => c.notNull())
          .addColumn("payload", blobType(dialect), (c) => c.notNull())
          .addColumn("chat_id", "bigint")
          .addColumn("user_id", "bigint")
          .addColumn("created_at", "text", (c) => c.notNull())
          .addColumn("expires_at", "text", (c) => c.notNull())
          .execute();

        await db.schema
          .createIndex("idx_callback_refs_expires")
          .on("telekit_callback_refs")
          .column("expires_at")
          .execute();
      },
      async down(db: Kysely<any>) {
        await db.schema.dropTable("telekit_callback_refs").execute();
      },
    },
  };
}

/** Framework-owned migrations, shipped as code inside @telekit/core — never as files a user needs to generate (spec §30, Appendix C). */
export function createCoreMigrationProvider(dialect: DatabaseDriver = "sqlite"): MigrationProvider {
  return {
    async getMigrations() {
      return buildMigrations(dialect);
    },
  };
}

/** Backward-compatible default — SQLite dialect, matching every existing caller that doesn't pass one. */
export const coreMigrationProvider: MigrationProvider = createCoreMigrationProvider("sqlite");
