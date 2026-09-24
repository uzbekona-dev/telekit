import { createDatabase, runMigrations, type TelekitDatabase } from "@telekit/core";
import type { Kysely } from "kysely";
import { createConversationsMigrationProvider } from "../../src/migrations.js";

/** In-memory SQLite database with core's framework tables plus `telekit_conversations`, applied through one combined migrator (mirrors how a real app wires both packages' migrations together). */
export async function createTestDatabase(): Promise<Kysely<TelekitDatabase>> {
  const db = createDatabase({ driver: "sqlite", file: ":memory:", url: null });
  if (!db) throw new Error("createDatabase returned null for driver=sqlite");
  await runMigrations(db, "sqlite", [createConversationsMigrationProvider("sqlite")]);
  return db;
}
