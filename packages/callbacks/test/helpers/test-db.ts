import { createDatabase, runMigrations, type TelekitDatabase } from "@telekit/core";
import type { Kysely } from "kysely";

/** In-memory SQLite database with all framework migrations applied — mirrors core's own test helper, built only from @telekit/core's public API. */
export async function createTestDatabase(): Promise<Kysely<TelekitDatabase>> {
  const db = createDatabase({ driver: "sqlite", file: ":memory:", url: null });
  if (!db) throw new Error("createDatabase returned null for driver=sqlite");
  await runMigrations(db);
  return db;
}
