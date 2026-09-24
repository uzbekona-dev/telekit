import { PostgresDialect } from "kysely";
import pg from "pg";

let bigintParserPatched = false;

/**
 * node-postgres returns BIGINT (OID 20) columns as strings by default — the
 * safe choice for a driver that can't know a query's values stay under
 * `Number.MAX_SAFE_INTEGER`. Telegram ids comfortably do (well under 2^53),
 * and every table here (`UsersTable.id`, `CallbackRefsTable.chat_id`/
 * `user_id`, ...) is already typed and used as `number` end to end — same
 * as SQLite's own dynamic typing already returns. Patching the global type
 * parser once keeps both dialects behaviorally identical for callers.
 */
function ensureBigintReturnsNumber(): void {
  if (bigintParserPatched) return;
  pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => Number.parseInt(value, 10));
  bigintParserPatched = true;
}

/** Builds the framework's Kysely Postgres dialect from a `postgres://` connection string (spec §22, v0.2 database adapters). */
export function createPostgresDialect(connectionString: string): PostgresDialect {
  ensureBigintReturnsNumber();
  return new PostgresDialect({
    pool: new pg.Pool({ connectionString }),
  });
}
