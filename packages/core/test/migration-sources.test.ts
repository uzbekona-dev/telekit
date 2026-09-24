import type { Kysely } from "kysely";
import type { MigrationProvider } from "kysely/migration";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Application } from "../src/application.js";
import { DEFAULT_CONFIG, defineConfig, type TelekitConfig } from "../src/config.js";
import { createDatabase } from "../src/db/connect.js";
import { combineMigrationProviders, getMigrationStatus, resolveMigrationProviders, runMigrations, type MigrationSource } from "../src/db/migrator.js";
import type { TelekitDatabase } from "../src/db/schema.js";

/** Stands in for a package like @telekit/conversations: a factory that picks DDL per driver. */
const demoMigrations = vi.fn<(driver: "sqlite" | "postgres") => MigrationProvider>((driver) => ({
  async getMigrations() {
    return {
      demo_0001_create_demo_things: {
        async up(db: Kysely<any>) {
          await db.schema
            .createTable("demo_things")
            .addColumn("id", driver === "postgres" ? "bigint" : "integer", (c) => c.primaryKey())
            .execute();
        },
      },
    };
  },
}));

function configWith(env: TelekitConfig["app"]["env"], providers: MigrationSource[]): TelekitConfig {
  return {
    ...DEFAULT_CONFIG,
    app: { ...DEFAULT_CONFIG.app, env, key: env === "production" ? Buffer.alloc(32, 1).toString("base64") : "" },
    bot: { ...DEFAULT_CONFIG.bot, token: "123:test", mode: "polling" },
    database: { driver: "sqlite", file: ":memory:", url: null, migrations: { providers } },
    logging: { level: "fatal", pretty: false },
  };
}

function memoryDb(): Kysely<TelekitDatabase> {
  return createDatabase({ driver: "sqlite", file: ":memory:", url: null })!;
}

describe("resolveMigrationProviders", () => {
  it("calls factories with the configured driver and passes ready providers through", () => {
    const ready: MigrationProvider = { getMigrations: async () => ({}) };

    const providers = resolveMigrationProviders({ driver: "postgres", migrations: { providers: [demoMigrations, ready] } });

    expect(providers).toHaveLength(2);
    expect(demoMigrations).toHaveBeenLastCalledWith("postgres");
    expect(providers[1]).toBe(ready);
  });

  it("is empty without a database or without declared providers", () => {
    expect(resolveMigrationProviders({ driver: "none", migrations: { providers: [demoMigrations] } })).toEqual([]);
    expect(resolveMigrationProviders({ driver: "sqlite" })).toEqual([]);
    expect(resolveMigrationProviders({ driver: "sqlite", migrations: {} })).toEqual([]);
  });
});

describe("database.migrations in defineConfig", () => {
  it("defaults to no extra providers and keeps the ones a project declares", () => {
    expect(defineConfig({ bot: { token: "1:a" } }).database.migrations).toEqual({ providers: [] });
    expect(defineConfig({ bot: { token: "1:a" }, database: { migrations: {} } }).database.migrations).toEqual({ providers: [] });
    expect(
      defineConfig({ bot: { token: "1:a" }, database: { migrations: { providers: [demoMigrations] } } }).database.migrations?.providers,
    ).toEqual([demoMigrations]);
  });
});

describe("Application + config-declared migrations", () => {
  const databases: Array<Kysely<TelekitDatabase>> = [];
  afterEach(async () => {
    await Promise.all(databases.splice(0).map((db) => db.destroy()));
  });

  it("development: prepare() applies them together with core's", async () => {
    const db = memoryDb();
    databases.push(db);
    const config = configWith("development", [demoMigrations]);

    await new Application(config, { db }).prepare();

    const status = await getMigrationStatus(db, "sqlite", resolveMigrationProviders(config.database));
    expect(status.pending).toEqual([]);
    expect(status.executed).toContain("demo_0001_create_demo_things");
  });

  it("production: stops with TK1050 until `telekit migrate` (the same resolved list) has run", async () => {
    const db = memoryDb();
    databases.push(db);
    const config = configWith("production", [demoMigrations]);
    const app = new Application(config, { db });

    await expect(app.prepare()).rejects.toMatchObject({ code: "TK1050", message: expect.stringContaining("demo_0001_create_demo_things") });

    await runMigrations(db, "sqlite", resolveMigrationProviders(config.database)); // what the CLI runner does
    await expect(app.prepare()).resolves.toBeUndefined();
  });

  it("still accepts providers passed programmatically via deps", async () => {
    const db = memoryDb();
    databases.push(db);
    const config = configWith("development", []);

    await new Application(config, { db, migrationProviders: [demoMigrations("sqlite")] }).prepare();

    const status = await getMigrationStatus(db, "sqlite", [demoMigrations("sqlite")]);
    expect(status.executed).toContain("demo_0001_create_demo_things");
  });
});

describe("combineMigrationProviders name collisions", () => {
  function provider(up: (db: Kysely<any>) => Promise<void>): MigrationProvider {
    return { getMigrations: async () => ({ shared_0001_create_things: { up } }) };
  }

  it("tolerates the same migration registered twice (config + deps)", async () => {
    const combined = combineMigrationProviders(demoMigrations("sqlite"), demoMigrations("sqlite"));
    expect(Object.keys(await combined.getMigrations())).toEqual(["demo_0001_create_demo_things"]);
  });

  it("rejects two different migrations under one name with TK1051", async () => {
    const first = provider(async (db) => void (await db.schema.createTable("a").addColumn("id", "integer").execute()));
    const second = provider(async (db) => void (await db.schema.createTable("b").addColumn("id", "integer").execute()));

    await expect(combineMigrationProviders(first, second).getMigrations()).rejects.toMatchObject({
      code: "TK1051",
      message: expect.stringContaining('"shared_0001_create_things"'),
    });
  });
});
