import type { Kysely } from "kysely";
import type { Migration, MigrationProvider } from "kysely/migration";

/** Matches `@telekit/core`'s own `DatabaseDriver` — duplicated here rather than imported to keep this package's public surface independent of core's db internals. */
export type ConversationsDatabaseDriver = "sqlite" | "postgres";

/**
 * `telekit_conversations` (ADR-004's log/checkpoint store). Named with the
 * `conversations_` migration-name prefix so it can share the same
 * `telekit_migrations` tracking table as `@telekit/core`'s own migrations
 * without ever colliding on name (spec ADR-005: "har migratsiya `up`/`down`
 * bilan").
 */
function buildMigrations(_dialect: ConversationsDatabaseDriver): Record<string, Migration> {
  // "bigint" for id-bearing columns: a safe no-op on SQLite's dynamic INTEGER
  // affinity, but required on Postgres — its "integer" is a true 4-byte type
  // that overflows real Telegram ids (see core/migrations.ts for the same fix).
  const idType = "bigint";

  return {
    conversations_0001_create_telekit_conversations: {
      async up(db: Kysely<any>) {
        await db.schema
          .createTable("telekit_conversations")
          .addColumn("id", "text", (c) => c.primaryKey())
          .addColumn("key", "text", (c) => c.notNull())
          .addColumn("name", "text", (c) => c.notNull())
          .addColumn("log", "text", (c) => c.notNull())
          .addColumn("checkpoint_id", "text")
          .addColumn("checkpoint_state", "text")
          .addColumn("pending_attempts", "integer", (c) => c.notNull().defaultTo(0))
          .addColumn("status", "text", (c) => c.notNull().defaultTo("active"))
          .addColumn("version", "integer", (c) => c.notNull().defaultTo(1))
          .addColumn("chat_id", idType)
          .addColumn("user_id", idType)
          .addColumn("created_at", "text", (c) => c.notNull())
          .addColumn("updated_at", "text", (c) => c.notNull())
          .addColumn("expires_at", "text")
          .execute();

        // `status='active'` is the hot path (looked up on every update); `key` alone would
        // also match finished conversations kept around for history/debugging.
        await db.schema
          .createIndex("idx_conversations_key_status")
          .on("telekit_conversations")
          .columns(["key", "status"])
          .execute();
      },
      async down(db: Kysely<any>) {
        await db.schema.dropTable("telekit_conversations").execute();
      },
    },
  };
}

export function createConversationsMigrationProvider(dialect: ConversationsDatabaseDriver = "sqlite"): MigrationProvider {
  return {
    async getMigrations() {
      return buildMigrations(dialect);
    },
  };
}
