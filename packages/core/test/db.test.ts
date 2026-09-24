import type { Kysely } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/db/migrator.js";
import type { TelekitDatabase } from "../src/db/schema.js";
import { UserRepository } from "../src/db/user-repository.js";
import { createTestDatabase } from "./helpers/test-db.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("database layer (node:sqlite via Kysely)", () => {
  let db: Kysely<TelekitDatabase>;

  afterEach(async () => {
    await db?.destroy();
  });

  it("creates every framework table via the in-code migrations", async () => {
    db = await createTestDatabase();
    const tables = await db.introspection.getTables();
    const names = tables.map((t) => t.name);

    expect(names).toEqual(
      expect.arrayContaining(["telekit_users", "telekit_sessions", "telekit_callback_refs"]),
    );
  });

  it("running migrations twice is a no-op the second time", async () => {
    db = await createTestDatabase();
    await expect(runMigrations(db)).resolves.toBeDefined();
  });

  it("inserts a new user on first sighting", async () => {
    db = await createTestDatabase();
    const repo = new UserRepository(db);

    const user = await repo.upsertFromTelegram({ id: 1, first_name: "Ali", is_bot: false });

    expect(user.id).toBe(1);
    expect(user.firstName).toBe("Ali");
    expect(user.status).toBe("active");
    expect(user.isPremium).toBe(false);
    expect(user.attributes).toEqual({});
  });

  it("does not issue a write on a no-op second sighting (spec §30.1)", async () => {
    db = await createTestDatabase();
    const repo = new UserRepository(db);

    await repo.upsertFromTelegram({ id: 1, first_name: "Ali", is_bot: false });
    const row1 = await db
      .selectFrom("telekit_users")
      .select("updated_at")
      .where("id", "=", 1)
      .executeTakeFirstOrThrow();

    await sleep(5);
    const second = await repo.upsertFromTelegram({ id: 1, first_name: "Ali", is_bot: false });
    const row2 = await db
      .selectFrom("telekit_users")
      .select("updated_at")
      .where("id", "=", 1)
      .executeTakeFirstOrThrow();

    expect(second.firstName).toBe("Ali");
    expect(row2.updated_at).toBe(row1.updated_at);
  });

  it("updates changed fields when the Telegram profile changes", async () => {
    db = await createTestDatabase();
    const repo = new UserRepository(db);

    await repo.upsertFromTelegram({ id: 1, first_name: "Ali", is_bot: false });
    const updated = await repo.upsertFromTelegram({ id: 1, first_name: "Aliyor", username: "aliyor", is_bot: false });

    expect(updated.firstName).toBe("Aliyor");
    expect(updated.username).toBe("aliyor");

    const reloaded = await repo.findById(1);
    expect(reloaded?.firstName).toBe("Aliyor");
  });

  it("touchLastSeen bumps last_seen_at without touching other fields", async () => {
    db = await createTestDatabase();
    const repo = new UserRepository(db);

    await repo.upsertFromTelegram({ id: 1, first_name: "Ali", is_bot: false });
    const before = await repo.findById(1);

    await sleep(5);
    await repo.touchLastSeen([1]);
    const after = await repo.findById(1);

    expect(after!.lastSeenAt.getTime()).toBeGreaterThan(before!.lastSeenAt.getTime());
    expect(after!.firstName).toBe("Ali");
  });

  it("markBlocked sets status to blocked", async () => {
    db = await createTestDatabase();
    const repo = new UserRepository(db);

    await repo.upsertFromTelegram({ id: 1, first_name: "Ali", is_bot: false });
    await repo.markBlocked(1);

    expect((await repo.findById(1))?.status).toBe("blocked");
  });

  it("round-trips custom attributes as JSON", async () => {
    db = await createTestDatabase();
    const repo = new UserRepository(db);

    await repo.upsertFromTelegram({ id: 1, first_name: "Ali", is_bot: false });
    await repo.setAttributes(1, { city: "Tashkent", plan: "pro" });

    expect((await repo.findById(1))?.attributes).toEqual({ city: "Tashkent", plan: "pro" });
  });

  it("findById returns null for an unknown user", async () => {
    db = await createTestDatabase();
    const repo = new UserRepository(db);
    expect(await repo.findById(999)).toBeNull();
  });
});
