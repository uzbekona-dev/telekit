import type { Kysely } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import type { TelekitDatabase } from "@telekit/core";
import { DatabaseCallbackRefStore } from "../src/ref-store.js";
import { createTestDatabase } from "./helpers/test-db.js";

describe("DatabaseCallbackRefStore", () => {
  let db: Kysely<TelekitDatabase>;

  afterEach(async () => {
    await db?.destroy();
  });

  it("round-trips a saved record", async () => {
    db = await createTestDatabase();
    const store = new DatabaseCallbackRefStore(db);

    const refId = await store.save({ route: "abcd", payload: new Uint8Array([1, 2, 3]) }, 60_000);
    const loaded = await store.load(refId);

    expect(loaded).toEqual({ route: "abcd", payload: new Uint8Array([1, 2, 3]), chatId: undefined, userId: undefined });
  });

  it("stores chatId/userId alongside the payload", async () => {
    db = await createTestDatabase();
    const store = new DatabaseCallbackRefStore(db);

    const refId = await store.save({ route: "abcd", payload: new Uint8Array([9]), userId: 42 }, 60_000);
    const loaded = await store.load(refId);

    expect(loaded?.userId).toBe(42);
    expect(loaded?.chatId).toBeUndefined();
  });

  it("returns null for an unknown ref id", async () => {
    db = await createTestDatabase();
    const store = new DatabaseCallbackRefStore(db);

    expect(await store.load("does-not-exist")).toBeNull();
  });

  it("returns null (and cleans up) for an expired ref", async () => {
    db = await createTestDatabase();
    const store = new DatabaseCallbackRefStore(db);

    const refId = await store.save({ route: "abcd", payload: new Uint8Array([1]) }, -1);
    expect(await store.load(refId)).toBeNull();

    const row = await db.selectFrom("telekit_callback_refs").selectAll().where("id", "=", refId).executeTakeFirst();
    expect(row).toBeUndefined();
  });

  it("generates a different ref id on every save", async () => {
    db = await createTestDatabase();
    const store = new DatabaseCallbackRefStore(db);

    const a = await store.save({ route: "abcd", payload: new Uint8Array([1]) }, 60_000);
    const b = await store.save({ route: "abcd", payload: new Uint8Array([1]) }, 60_000);

    expect(a).not.toBe(b);
  });
});
