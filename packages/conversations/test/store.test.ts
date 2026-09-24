import type { Kysely } from "kysely";
import type { TelekitDatabase } from "@telekit/core";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseConversationStore } from "../src/store.js";
import { ConversationConflictError } from "../src/errors.js";
import { createTestDatabase } from "./helpers/test-db.js";

describe("DatabaseConversationStore", () => {
  let db: Kysely<TelekitDatabase>;

  afterEach(async () => {
    await db?.destroy();
  });

  it("creates and finds an active conversation by key", async () => {
    db = await createTestDatabase();
    const store = new DatabaseConversationStore(db);

    await store.create({ id: "c1", key: "user-chat:1:1", name: "register", params: { source: "deep-link" }, chatId: 1, userId: 1, expiresAt: null });
    const found = await store.findActive("user-chat:1:1");

    expect(found?.name).toBe("register");
    expect(found?.params).toEqual({ source: "deep-link" });
    expect(found?.status).toBe("active");
    expect(found?.log).toEqual({ version: 1, entries: [] });
    expect(found?.version).toBe(1);
  });

  it("returns null when there is no active conversation for a key", async () => {
    db = await createTestDatabase();
    const store = new DatabaseConversationStore(db);
    expect(await store.findActive("nope")).toBeNull();
  });

  it("update() persists the log and bumps the version", async () => {
    db = await createTestDatabase();
    const store = new DatabaseConversationStore(db);
    const record = await store.create({ id: "c2", key: "k2", name: "register", chatId: 1, userId: 1, expiresAt: null });

    const ok = await store.update(
      record.id,
      { log: { version: 1, entries: [{ k: "ask", i: 0, value: "Ali" }] }, pendingAttempts: 0 },
      record.version,
    );
    expect(ok).toBe(true);

    const reloaded = await store.findActive("k2");
    expect(reloaded?.log.entries).toEqual([{ k: "ask", i: 0, value: "Ali" }]);
    expect(reloaded?.version).toBe(2);
  });

  it("update() fails (optimistic lock) against a stale version", async () => {
    db = await createTestDatabase();
    const store = new DatabaseConversationStore(db);
    const record = await store.create({ id: "c3", key: "k3", name: "register", chatId: 1, userId: 1, expiresAt: null });

    await store.update(record.id, { pendingAttempts: 1 }, record.version);
    const staleOk = await store.update(record.id, { pendingAttempts: 2 }, record.version); // reuses the now-stale version
    expect(staleOk).toBe(false);
  });

  it("update({status: 'done'}) removes the record from findActive()", async () => {
    db = await createTestDatabase();
    const store = new DatabaseConversationStore(db);
    const record = await store.create({ id: "c4", key: "k4", name: "register", chatId: 1, userId: 1, expiresAt: null });

    await store.update(record.id, { status: "done" }, record.version);
    expect(await store.findActive("k4")).toBeNull();
  });

  it("findExpired() returns active conversations past their expiresAt", async () => {
    db = await createTestDatabase();
    const store = new DatabaseConversationStore(db);
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 60_000);

    await store.create({ id: "c5", key: "k5", name: "register", chatId: 1, userId: 1, expiresAt: past });
    await store.create({ id: "c6", key: "k6", name: "register", chatId: 1, userId: 1, expiresAt: future });

    const expired = await store.findExpired(new Date());
    expect(expired.map((r) => r.id)).toEqual(["c5"]);
  });

  it("enforces one active conversation per key at the database boundary", async () => {
    db = await createTestDatabase();
    const store = new DatabaseConversationStore(db);
    const first = store.create({ id: "race-a", key: "same", name: "a", chatId: 1, userId: 1, expiresAt: null });
    const second = store.create({ id: "race-b", key: "same", name: "b", chatId: 1, userId: 1, expiresAt: null });

    const results = await Promise.allSettled([first, second]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(ConversationConflictError);
    expect((await store.findActive("same"))?.name).toMatch(/^[ab]$/u);
  });
});
