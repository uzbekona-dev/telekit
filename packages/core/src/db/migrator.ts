import type { Kysely } from "kysely";
import { Migrator, type Migration, type MigrationProvider, type MigrationResultSet } from "kysely/migration";
import type { TelekitConfig } from "../config.js";
import { ConfigurationError } from "../errors.js";
import { createCoreMigrationProvider, type DatabaseDriver } from "./migrations.js";
import type { TelekitDatabase } from "./schema.js";

export const MIGRATION_TABLE_NAME = "telekit_migrations";
export const MIGRATION_LOCK_TABLE_NAME = "telekit_migrations_lock";

/**
 * Another framework package's migrations, as declared in
 * `database.migrations.providers`: a ready `MigrationProvider`, or a factory
 * that picks dialect-specific DDL for the configured driver — e.g.
 * `createConversationsMigrationProvider` itself, passed uncalled.
 */
export type MigrationSource = MigrationProvider | ((driver: DatabaseDriver) => MigrationProvider);

/**
 * The extra (non-core) providers `config.database.migrations.providers`
 * declares, resolved for the configured driver. Both `Application` and
 * `telekit migrate` go through this, so the running app and the CLI always
 * agree on which migrations exist (a mismatch left production apps stuck on
 * TK1050 with no command able to apply the missing ones).
 */
export function resolveMigrationProviders(database: Pick<TelekitConfig["database"], "driver" | "migrations">): MigrationProvider[] {
  if (database.driver === "none") return [];
  const driver = database.driver;
  return (database.migrations?.providers ?? []).map((source) => (typeof source === "function" ? source(driver) : source));
}

/**
 * Merges several `MigrationProvider`s into one. Kysely's `Migrator` requires
 * a single provider whose `getMigrations()` covers *everything* ever
 * recorded in the shared tracking table — running two separate `Migrator`s
 * with non-overlapping providers against the same table fails with
 * "corrupted migrations" the moment either one can't see migrations the
 * other already applied. Other framework packages (e.g.
 * `@telekit/conversations`) that ship their own migrations are expected to
 * be combined with `coreMigrationProvider` via this helper (spec ADR-005 —
 * "har migratsiya" still applies once merged, migration names just need to
 * stay globally unique, which the `<package>_NNNN_...` naming convention
 * guarantees).
 */
export function combineMigrationProviders(...providers: MigrationProvider[]): MigrationProvider {
  return {
    async getMigrations() {
      const merged: Record<string, Migration> = {};
      for (const provider of providers) {
        for (const [name, migration] of Object.entries(await provider.getMigrations())) {
          const existing = merged[name];
          if (existing && !isSameMigration(existing, migration)) {
            throw new ConfigurationError(
              "TK1051",
              `"${name}" nomli migratsiya ikki manbada turlicha ta'riflangan — biri jimgina tashlab yuborilardi. Migratsiya nomlari global unikal bo'lishi kerak ("<paket>_0001_..." kabi).`,
            );
          }
          merged[name] = migration;
        }
      }
      return merged;
    },
  };
}

/** The same provider registered twice (config + `deps`) yields equal code under one name — harmless; different code under one name is a real collision. */
function isSameMigration(a: Migration, b: Migration): boolean {
  return a === b || (String(a.up) === String(b.up) && String(a.down) === String(b.down));
}

export function createMigrator(
  db: Kysely<TelekitDatabase>,
  dialect: DatabaseDriver = "sqlite",
  extraProviders: MigrationProvider[] = [],
): Migrator {
  const provider =
    extraProviders.length === 0
      ? createCoreMigrationProvider(dialect)
      : combineMigrationProviders(createCoreMigrationProvider(dialect), ...extraProviders);

  return new Migrator({
    db: db as unknown as Kysely<any>,
    provider,
    migrationTableName: MIGRATION_TABLE_NAME,
    migrationLockTableName: MIGRATION_LOCK_TABLE_NAME,
  });
}

export interface MigrationStatus {
  pending: string[];
  executed: string[];
}

export async function getMigrationStatus(
  db: Kysely<TelekitDatabase>,
  dialect: DatabaseDriver = "sqlite",
  extraProviders: MigrationProvider[] = [],
): Promise<MigrationStatus> {
  const migrations = await createMigrator(db, dialect, extraProviders).getMigrations();
  return {
    executed: migrations.filter((m) => m.executedAt).map((m) => m.name),
    pending: migrations.filter((m) => !m.executedAt).map((m) => m.name),
  };
}

/** Throws with every migration error surfaced — callers (CLI, startup checks) decide how to present it. */
export async function runMigrations(
  db: Kysely<TelekitDatabase>,
  dialect: DatabaseDriver = "sqlite",
  extraProviders: MigrationProvider[] = [],
): Promise<MigrationResultSet> {
  const result = await createMigrator(db, dialect, extraProviders).migrateToLatest();
  if (result.error) {
    throw result.error;
  }
  return result;
}
