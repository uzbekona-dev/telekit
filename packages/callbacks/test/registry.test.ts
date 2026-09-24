import { describe, expect, it } from "vitest";
import { defineCallback, type CallbackHandle } from "../src/callback.js";
import { CallbackIdCollisionError, createCallbackRegistry } from "../src/registry.js";
import { uint } from "../src/schema.js";

/** A minimal stand-in for the registry's own bookkeeping — real `defineCallback` handles
 * derive `routeId` from a SHA-256 hash, which can't be forced to collide without brute
 * force, so collision detection is exercised directly against these plain objects. */
function fakeHandle(name: string, routeId: string): CallbackHandle<any> {
  return { name, routeId, scope: "global", schema: {}, middleware: [], handle: () => {} } as unknown as CallbackHandle<any>;
}

describe("CallbackRegistry — collision", () => {
  it("resolves a registered handle by its routeId", () => {
    const openCart = defineCallback({
      name: "cart.open",
      schema: { page: uint() },
      handle: () => {},
    });

    const registry = createCallbackRegistry([openCart]);

    expect(registry.resolve(openCart.routeId)).toBe(openCart);
    expect(registry.list()).toEqual([openCart]);
  });

  it("throws CallbackIdCollisionError when two different names hash to the same routeId", () => {
    const a = fakeHandle("user.delete", "7Kd2");
    const b = fakeHandle("order.refund", "7Kd2");

    expect(() => createCallbackRegistry([a, b])).toThrow(CallbackIdCollisionError);
  });

  it("does not throw when the same handle is registered twice (idempotent re-registration)", () => {
    const openCart = defineCallback({ name: "cart.open", schema: {}, handle: () => {} });

    expect(() => createCallbackRegistry([openCart, openCart])).not.toThrow();
  });
});
