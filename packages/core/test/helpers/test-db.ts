import { Kysely } from "kysely";
import { createNodeSqliteDialect } from "../../src/db/node-sqlite-dialect.js";
import { runMigrations } from "../../src/db/migrator.js";
import type { TelekitDatabase } from "../../src/db/schema.js";

/** In-memory SQLite database with all framework migrations applied — no file I/O, safe for parallel test files. */
export async function createTestDatabase(): Promise<Kysely<TelekitDatabase>> {
  const db = new Kysely<TelekitDatabase>({ dialect: createNodeSqliteDialect(":memory:") });
  await runMigrations(db);
  return db;
}
