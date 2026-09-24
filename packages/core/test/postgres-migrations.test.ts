import type { CompiledQuery, DatabaseConnection, Dialect, QueryResult } from "kysely";
import { Kysely, PostgresDialect } from "kysely";
import { describe, expect, it } from "vitest";
import pg from "pg";
import { createCoreMigrationProvider } from "../src/db/migrations.js";

/**
 * Wraps a real dialect's query compiler/adapter (so SQL generation is
 * genuinely dialect-accurate) but replaces the driver with one that just
 * records compiled SQL instead of opening a network connection — lets these
 * tests assert on real Postgres-flavored SQL without a live Postgres server.
 */
class CapturingDriver implements DatabaseConnection {
  readonly queries: string[] = [];

  async init(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    return this;
  }
  async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
    this.queries.push(compiled.sql);
    return { rows: [] };
  }
  async *streamQuery(): AsyncIterableIterator<never> {}
  async beginTransaction(): Promise<void> {}
  async commitTransaction(): Promise<void> {}
  async rollbackTransaction(): Promise<void> {}
  async releaseConnection(): Promise<void> {}
  async destroy(): Promise<void> {}
}

function capturingDialect(base: Dialect, driver: CapturingDriver): Dialect {
  return {
    createDriver: () => driver as any,
    createQueryCompiler: () => base.createQueryCompiler(),
    createAdapter: () => base.createAdapter(),
    createIntrospector: (db: Kysely<any>) => base.createIntrospector(db),
  };
}

describe("createCoreMigrationProvider('postgres')", () => {
  it("creates telekit_callback_refs.payload as bytea (not sqlite's blob)", async () => {
    const driver = new CapturingDriver();
    const base = new PostgresDialect({ pool: new pg.Pool({ connectionString: "postgres://unused/unused" }) });
    const db = new Kysely<any>({ dialect: capturingDialect(base, driver) });

    const migrations = await createCoreMigrationProvider("postgres").getMigrations();
    await migrations["0003_create_telekit_callback_refs"]!.up(db);

    const createTableSql = driver.queries.find((q) => q.includes("create table"));
    expect(createTableSql).toContain("bytea");
    expect(createTableSql).not.toContain("blob");
  });

  it("uses bigint (not integer) for Telegram-id-bearing columns, avoiding int4 overflow", async () => {
    const driver = new CapturingDriver();
    const base = new PostgresDialect({ pool: new pg.Pool({ connectionString: "postgres://unused/unused" }) });
    const db = new Kysely<any>({ dialect: capturingDialect(base, driver) });

    const migrations = await createCoreMigrationProvider("postgres").getMigrations();
    await migrations["0001_create_telekit_users"]!.up(db);
    await migrations["0003_create_telekit_callback_refs"]!.up(db);

    const usersSql = driver.queries.find((q) => q.includes("telekit_users"));
    const refsSql = driver.queries.find((q) => q.includes("telekit_callback_refs") && q.includes("create table"));
    expect(usersSql).toContain("bigint");
    expect(refsSql).toContain("bigint");
  });
});

describe("createCoreMigrationProvider('sqlite') (default)", () => {
  it("still uses blob for telekit_callback_refs.payload", async () => {
    // Uses the real sqlite dialect's compiler via the same capture technique,
    // just to assert the two dialects genuinely diverge on this column.
    const { createNodeSqliteDialect } = await import("../src/db/node-sqlite-dialect.js");
    const driver = new CapturingDriver();
    const base = createNodeSqliteDialect(":memory:");
    const db = new Kysely<any>({ dialect: capturingDialect(base, driver) });

    const migrations = await createCoreMigrationProvider("sqlite").getMigrations();
    await migrations["0003_create_telekit_callback_refs"]!.up(db);

    const createTableSql = driver.queries.find((q) => q.includes("create table"));
    expect(createTableSql).toContain("blob");
  });
});
