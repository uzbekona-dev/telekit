import { VirtualClock, createDatabase, runMigrations, type TelekitDatabase } from "@telekit/core";
import type { Kysely } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSessionStore } from "../src/database-store.js";

async function createTestDb(): Promise<Kysely<TelekitDatabase>> {
  const db = createDatabase({ driver: "sqlite", file: ":memory:", url: null })!;
  await runMigrations(db);
  return db;
}

describe("DatabaseSessionStore", () => {
  let db: Kysely<TelekitDatabase>;

  afterEach(async () => {
    await db?.destroy();
  });

  it("returns null for a key that was never saved", async () => {
    db = await createTestDb();
    const store = new DatabaseSessionStore(db);
    expect(await store.load("missing")).toBeNull();
  });

  it("inserts on first save (expectedVersion 0) and updates thereafter", async () => {
    db = await createTestDb();
    const store = new DatabaseSessionStore(db);

    expect(await store.save("k", { count: 1 }, 0, null)).toBe(true);
    expect(await store.load("k")).toEqual({ data: { count: 1 }, version: 1 });

    expect(await store.save("k", { count: 2 }, 1, null)).toBe(true);
    expect(await store.load("k")).toEqual({ data: { count: 2 }, version: 2 });
  });

  it("rejects a concurrent write via the version column", async () => {
    db = await createTestDb();
    const store = new DatabaseSessionStore(db);
    await store.save("k", { count: 1 }, 0, null);

    const stale = await store.save("k", { count: 99 }, 0, null);
    expect(stale).toBe(false);
    expect(await store.load("k")).toEqual({ data: { count: 1 }, version: 1 });
  });

  it("treats a duplicate first-insert as a conflict instead of throwing", async () => {
    db = await createTestDb();
    const store = new DatabaseSessionStore(db);
    await store.save("k", { count: 1 }, 0, null);

    const duplicateInsert = await store.save("k", { count: 2 }, 0, null);
    expect(duplicateInsert).toBe(false);
  });

  it("expires entries past their TTL", async () => {
    db = await createTestDb();
    const store = new DatabaseSessionStore(db);
    await store.save("k", { count: 1 }, 0, -1000); // already expired

    expect(await store.load("k")).toBeNull();
  });

  it("expires entries against an injected VirtualClock, and stamps rows with virtual (not real) time", async () => {
    db = await createTestDb();
    const clock = new VirtualClock();
    const store = new DatabaseSessionStore(db, clock);

    await store.save("k", { count: 1 }, 0, 1000);
    const row = await db.selectFrom("telekit_sessions").selectAll().where("key", "=", "k").executeTakeFirstOrThrow();
    expect(row.updated_at).toBe(new Date(0).toISOString());
    expect(row.expires_at).toBe(new Date(1000).toISOString());

    await clock.advance(999);
    expect(await store.load("k")).not.toBeNull();

    await clock.advance(1);
    expect(await store.load("k")).toBeNull();
  });
});
