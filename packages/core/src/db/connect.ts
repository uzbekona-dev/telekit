import { Kysely } from "kysely";
import type { TelekitConfig } from "../config.js";
import { ConfigurationError } from "../errors.js";
import { createNodeSqliteDialect } from "./node-sqlite-dialect.js";
import { createPostgresDialect } from "./postgres-dialect.js";
import type { TelekitDatabase } from "./schema.js";

/**
 * Builds the framework's Kysely instance from `config.database`, or returns
 * `null` for `driver: "none"` (the Minimal template's default — spec §9).
 * `defineConfig` already rejects `driver: "postgres"` without a `url` before
 * this ever runs.
 */
export function createDatabase(config: TelekitConfig["database"]): Kysely<TelekitDatabase> | null {
  if (config.driver === "none") return null;

  if (config.driver === "sqlite") {
    return new Kysely<TelekitDatabase>({ dialect: createNodeSqliteDialect(config.file) });
  }

  if (config.driver === "postgres") {
    if (!config.url) {
      throw new ConfigurationError("TK1010", 'database.driver="postgres" tanlangan, lekin database.url berilmagan');
    }
    return new Kysely<TelekitDatabase>({ dialect: createPostgresDialect(config.url) });
  }

  throw new ConfigurationError("TK1010", `Qo'llab-quvvatlanmaydigan database.driver: "${config.driver}"`);
}
