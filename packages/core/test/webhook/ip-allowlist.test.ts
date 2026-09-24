import { describe, expect, it } from "vitest";
import { isTelegramIp } from "../../src/webhook/ip-allowlist.js";

describe("isTelegramIp", () => {
  it("accepts addresses inside 149.154.160.0/20", () => {
    expect(isTelegramIp("149.154.160.0")).toBe(true);
    expect(isTelegramIp("149.154.167.255")).toBe(true); // last address in the /20
    expect(isTelegramIp("149.154.175.255")).toBe(true); // range spans .160.0-.175.255
  });

  it("accepts addresses inside 91.108.4.0/22", () => {
    expect(isTelegramIp("91.108.4.0")).toBe(true);
    expect(isTelegramIp("91.108.7.255")).toBe(true); // last address in the /22
  });

  it("rejects an address just outside either range", () => {
    expect(isTelegramIp("149.154.176.0")).toBe(false); // one past the /20
    expect(isTelegramIp("91.108.8.0")).toBe(false); // one past the /22
    expect(isTelegramIp("8.8.8.8")).toBe(false);
  });

  it("normalizes an IPv4-mapped IPv6 address before checking", () => {
    expect(isTelegramIp("::ffff:149.154.160.5")).toBe(true);
    expect(isTelegramIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("rejects malformed input instead of throwing", () => {
    expect(isTelegramIp("not-an-ip")).toBe(false);
    expect(isTelegramIp("")).toBe(false);
    expect(isTelegramIp("999.999.999.999")).toBe(false);
  });
});
