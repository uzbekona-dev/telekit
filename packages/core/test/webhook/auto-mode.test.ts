import { describe, expect, it, vi } from "vitest";
import { resolveAutoMode } from "../../src/webhook/auto-mode.js";

describe("resolveAutoMode (spec §14.7)", () => {
  it("always resolves to polling in development, regardless of publicUrl", async () => {
    const checkUrlReachable = vi.fn();
    const result = await resolveAutoMode({ env: "development", publicUrl: "https://bot.example.com", checkUrlReachable });

    expect(result).toEqual({ mode: "polling", warnings: [] });
    expect(checkUrlReachable).not.toHaveBeenCalled();
  });

  it("resolves to polling + TK1030 in production with no publicUrl", async () => {
    const result = await resolveAutoMode({ env: "production", publicUrl: null, checkUrlReachable: vi.fn() });

    expect(result.mode).toBe("polling");
    expect(result.warnings).toEqual([expect.objectContaining({ code: "TK1030" })]);
  });

  it("resolves to polling + TK1031 in production with a non-https publicUrl", async () => {
    const result = await resolveAutoMode({
      env: "production",
      publicUrl: "http://bot.example.com",
      checkUrlReachable: vi.fn(),
    });

    expect(result.mode).toBe("polling");
    expect(result.warnings).toEqual([expect.objectContaining({ code: "TK1031" })]);
  });

  it("resolves to polling + TK1032 in production with an https URL that isn't reachable", async () => {
    const result = await resolveAutoMode({
      env: "production",
      publicUrl: "https://bot.example.com",
      checkUrlReachable: async () => false,
    });

    expect(result.mode).toBe("polling");
    expect(result.warnings).toEqual([expect.objectContaining({ code: "TK1032" })]);
  });

  it("resolves to webhook (no warnings) in production with a reachable https URL", async () => {
    const result = await resolveAutoMode({
      env: "production",
      publicUrl: "https://bot.example.com",
      checkUrlReachable: async () => true,
    });

    expect(result).toEqual({ mode: "webhook", warnings: [] });
  });
});
