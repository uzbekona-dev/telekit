import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import { SqliteDialect } from "kysely";

/** Kysely hands us `unknown[]` (it's dialect-agnostic); at runtime these are always primitives/Buffers a bound query actually produces. */
function asSqliteParams(parameters: readonly unknown[]): SQLInputValue[] {
  return parameters as SQLInputValue[];
}

interface WrappedStatement {
  readonly reader: boolean;
  all(parameters: readonly unknown[]): unknown[];
  run(parameters: readonly unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  iterate(parameters: readonly unknown[]): IterableIterator<unknown>;
}

/**
 * node:sqlite's StatementSync has no `.reader` flag like better-sqlite3 does.
 * `.columns()` returns the result column list — empty for INSERT/UPDATE/DELETE,
 * non-empty for SELECT/PRAGMA — which is exactly the "is this a read" signal
 * Kysely's SqliteDriver needs.
 */
function wrapStatement(stmt: StatementSync): WrappedStatement {
  return {
    reader: stmt.columns().length > 0,
    all: (parameters) => stmt.all(...asSqliteParams(parameters)),
    run: (parameters) => {
      const result = stmt.run(...asSqliteParams(parameters));
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    },
    iterate: (parameters) => stmt.iterate(...asSqliteParams(parameters)),
  };
}

/**
 * Adapts Node's built-in `node:sqlite` to the minimal better-sqlite3-shaped
 * interface Kysely's own `SqliteDialect` expects (see kysely's
 * `SqliteDatabase`/`SqliteStatement`). This avoids a native dependency
 * entirely — no node-gyp, no prebuilt-binary matrix across platforms —
 * which is why it's the v0.2 default over `better-sqlite3` (ADR-005).
 */
export function createNodeSqliteDialect(file: string): SqliteDialect {
  return new SqliteDialect({
    database: () => {
      if (file !== ":memory:") {
        mkdirSync(path.dirname(file), { recursive: true });
      }
      const db = new DatabaseSync(file);
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("PRAGMA foreign_keys = ON");
      return Promise.resolve({
        close: () => db.close(),
        prepare: (sql: string) => wrapStatement(db.prepare(sql)),
      });
    },
  });
}
