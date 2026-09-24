import { describe, expect, it } from "vitest";
import { bool, uint } from "../src/schema.js";
import {
  CallbackDecodeError,
  CallbackSignatureError,
  computeRouteId,
  decodeCallback,
  encodeCallback,
  type CodecOptions,
  type WireCallbackDefinition,
} from "../src/wire.js";

const KEY = Buffer.from("a".repeat(32));

function makeCodec(overrides: Partial<CodecOptions> = {}): CodecOptions {
  return { key: KEY, sigBytes: 6, sign: true, ...overrides };
}

const globalDef: WireCallbackDefinition = {
  name: "user.delete",
  routeId: computeRouteId("user.delete"),
  scope: "global",
  schema: { userId: uint(), confirm: bool() },
};

const userDef: WireCallbackDefinition = {
  name: "cart.remove",
  routeId: computeRouteId("cart.remove"),
  scope: "user",
  schema: { itemId: uint() },
};

const chatDef: WireCallbackDefinition = {
  name: "poll.vote",
  routeId: computeRouteId("poll.vote"),
  scope: "chat",
  schema: { optionId: uint() },
};

function lookupFor(...defs: WireCallbackDefinition[]) {
  return (routeId: string) => defs.find((d) => d.routeId === routeId);
}

describe("callback wire format — round-trip", () => {
  it("encodes and decodes a global-scope callback back to the original data", () => {
    const codec = makeCodec();
    const raw = encodeCallback(globalDef, { userId: 1928391234, confirm: true }, codec);

    const { def, data } = decodeCallback(raw, lookupFor(globalDef), {}, codec);

    expect(def.name).toBe("user.delete");
    expect(data).toEqual({ userId: 1928391234, confirm: true });
  });

  it("produces the <routeId>.<payload>.<sig> wire shape", () => {
    const codec = makeCodec();
    const raw = encodeCallback(globalDef, { userId: 1, confirm: false }, codec);
    const parts = raw.split(".");

    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(globalDef.routeId);
    expect(parts[0]).toHaveLength(4);
  });

  it("computeRouteId is deterministic and independent of registration order", () => {
    expect(computeRouteId("user.delete")).toBe(computeRouteId("user.delete"));
    expect(computeRouteId("user.delete")).not.toBe(computeRouteId("order.refund"));
  });

  it("round-trips with signing disabled (development mode)", () => {
    const codec = makeCodec({ sign: false });
    const raw = encodeCallback(globalDef, { userId: 42, confirm: true }, codec);

    expect(raw.endsWith(".")).toBe(true);
    const { data } = decodeCallback(raw, lookupFor(globalDef), {}, codec);
    expect(data).toEqual({ userId: 42, confirm: true });
  });
});

describe("callback wire format — tamper detection", () => {
  it("rejects a payload that was modified after signing", () => {
    const codec = makeCodec();
    const raw = encodeCallback(globalDef, { userId: 1, confirm: false }, codec);
    const [routeId, payload, sig] = raw.split(".");
    const tampered = `${routeId}.${payload}X.${sig}`;

    expect(() => decodeCallback(tampered, lookupFor(globalDef), {}, codec)).toThrow(CallbackSignatureError);
  });

  it("rejects a signature that was modified", () => {
    const codec = makeCodec();
    const raw = encodeCallback(globalDef, { userId: 1, confirm: false }, codec);
    const [routeId, payload, sig] = raw.split(".");
    const flippedChar = sig![0] === "a" ? "b" : "a";
    const tampered = `${routeId}.${payload}.${flippedChar}${sig!.slice(1)}`;

    expect(() => decodeCallback(tampered, lookupFor(globalDef), {}, codec)).toThrow(CallbackSignatureError);
  });

  it("rejects malformed wire strings outright", () => {
    const codec = makeCodec();
    expect(() => decodeCallback("not-a-valid-callback", lookupFor(globalDef), {}, codec)).toThrow(
      CallbackDecodeError,
    );
  });

  it("rejects a signature produced with a different key", () => {
    const codec = makeCodec();
    const otherCodec = makeCodec({ key: Buffer.from("b".repeat(32)) });
    const raw = encodeCallback(globalDef, { userId: 1, confirm: false }, codec);

    expect(() => decodeCallback(raw, lookupFor(globalDef), {}, otherCodec)).toThrow(CallbackSignatureError);
  });
});

describe("callback wire format — scope", () => {
  it("user scope: signature is valid for the same fromId", () => {
    const codec = makeCodec();
    const raw = encodeCallback(userDef, { itemId: 7 }, codec, 111);

    const { data } = decodeCallback(raw, lookupFor(userDef), { fromId: 111 }, codec);
    expect(data).toEqual({ itemId: 7 });
  });

  it("user scope: a different fromId cannot press the same button", () => {
    const codec = makeCodec();
    const raw = encodeCallback(userDef, { itemId: 7 }, codec, 111);

    expect(() => decodeCallback(raw, lookupFor(userDef), { fromId: 222 }, codec)).toThrow(CallbackSignatureError);
  });

  it("chat scope: a different chatId cannot press the same button", () => {
    const codec = makeCodec();
    const raw = encodeCallback(chatDef, { optionId: 2 }, codec, 500);

    expect(() => decodeCallback(raw, lookupFor(chatDef), { chatId: 501 }, codec)).toThrow(CallbackSignatureError);
  });

  it("global scope ignores from/chat entirely", () => {
    const codec = makeCodec();
    const raw = encodeCallback(globalDef, { userId: 1, confirm: true }, codec);

    const { data } = decodeCallback(raw, lookupFor(globalDef), { fromId: 999, chatId: 999 }, codec);
    expect(data).toEqual({ userId: 1, confirm: true });
  });

  it("encoding a user/chat-scope callback without a scopeId throws", () => {
    const codec = makeCodec();
    expect(() => encodeCallback(userDef, { itemId: 1 }, codec)).toThrow();
  });
});
