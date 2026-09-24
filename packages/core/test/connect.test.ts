import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/connect.js";

describe("createDatabase", () => {
  it("returns null for driver='none'", () => {
    expect(createDatabase({ driver: "none", file: "", url: null })).toBeNull();
  });

  it("returns a working Kysely instance for driver='sqlite'", async () => {
    const db = createDatabase({ driver: "sqlite", file: ":memory:", url: null });
    expect(db).not.toBeNull();
    await db!.destroy();
  });

  it("returns a Kysely instance for driver='postgres' without connecting (pg.Pool is lazy)", async () => {
    const db = createDatabase({ driver: "postgres", file: "", url: "postgres://user:pass@localhost:5432/db" });
    expect(db).not.toBeNull();
    await db!.destroy();
  });

  it("throws ConfigurationError for driver='postgres' without a url", () => {
    expect(() => createDatabase({ driver: "postgres", file: "", url: null })).toThrow(/database\.url/);
  });
});
