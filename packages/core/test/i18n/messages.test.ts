import { describe, expect, it } from "vitest";
import { flattenMessages } from "../../src/i18n/messages.js";

describe("flattenMessages", () => {
  it("passes through already-flat keys unchanged", () => {
    expect(flattenMessages({ welcome: "Salom" })).toEqual({ welcome: "Salom" });
  });

  it("flattens nested objects into dot-path keys", () => {
    expect(flattenMessages({ orders: { count: "{count}", total: "Jami" } })).toEqual({
      "orders.count": "{count}",
      "orders.total": "Jami",
    });
  });

  it("flattens arbitrarily deep nesting", () => {
    expect(flattenMessages({ a: { b: { c: "deep" } } })).toEqual({ "a.b.c": "deep" });
  });

  it("returns an empty object for an empty input", () => {
    expect(flattenMessages({})).toEqual({});
  });
});
