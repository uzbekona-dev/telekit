import { describe, expect, it } from "vitest";
import { resolveSecretPath, resolveSecretToken, secretTokenMatches } from "../../src/webhook/secret.js";

const KEY = Buffer.from("a".repeat(32));

describe("resolveSecretToken / resolveSecretPath", () => {
  it("returns the explicitly configured value when given", () => {
    expect(resolveSecretToken("my-token", KEY)).toBe("my-token");
    expect(resolveSecretPath("my-path", KEY)).toBe("my-path");
  });

  it("derives a stable value from APP_KEY when unconfigured", () => {
    const a = resolveSecretToken(null, KEY);
    const b = resolveSecretToken(null, KEY);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("derives different values for token vs path from the same key", () => {
    expect(resolveSecretToken(null, KEY)).not.toBe(resolveSecretPath(null, KEY));
  });

  it("derives a different value for a different key", () => {
    const otherKey = Buffer.from("b".repeat(32));
    expect(resolveSecretToken(null, KEY)).not.toBe(resolveSecretToken(null, otherKey));
  });
});

describe("secretTokenMatches", () => {
  it("matches identical values", () => {
    expect(secretTokenMatches("abc123", "abc123")).toBe(true);
  });

  it("rejects a mismatched value", () => {
    expect(secretTokenMatches("abc123", "abc124")).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(secretTokenMatches(undefined, "abc123")).toBe(false);
  });

  it("rejects different-length values without throwing", () => {
    expect(secretTokenMatches("short", "a-much-longer-expected-value")).toBe(false);
  });
});
