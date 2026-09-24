import { ValidationError } from "@telekit/core";
import { describe, expect, it } from "vitest";
import { ByteReader, ByteWriter } from "../src/binary.js";
import { bool, decodePayload, encodePayload, enumOf, int, str, uint, uuidField, type CallbackSchema } from "../src/schema.js";

function roundTrip(schema: CallbackSchema, data: Record<string, unknown>): Record<string, unknown> {
  return decodePayload(schema, encodePayload(schema, data));
}

describe("callback payload schema — encode/decode round trip", () => {
  it("round-trips every field kind, including ids beyond 2^32 and negative ints", () => {
    const schema = {
      userId: uint(),
      delta: int(),
      active: bool(),
      role: enumOf(["user", "admin", "owner"]),
      note: str(20),
      ref: uuidField(),
    };
    const data = {
      userId: 8_790_370_872,
      delta: -123_456_789,
      active: true,
      role: "owner",
      note: "salom 👋",
      ref: "0f8fad5b-d9cb-469f-a165-70867728950e",
    };

    expect(roundTrip(schema, data)).toEqual(data);
    expect(roundTrip(schema, { ...data, active: false, delta: 0 })).toMatchObject({ active: false, delta: 0 });
  });

  it("marks present optional fields in a one-byte mask and restores defaults for absent ones", () => {
    const schema = {
      page: uint().optional(),
      sort: enumOf(["new", "old"]).optional().default("new"),
      q: str(10),
    };

    // bit 0 = page, bit 1 = sort — the encoder writes a defaulted value explicitly
    const withPage = encodePayload(schema, { page: 3, q: "a" });
    expect(withPage[0]).toBe(0b11);
    expect(decodePayload(schema, withPage)).toEqual({ page: 3, sort: "new", q: "a" });

    const withoutPage = encodePayload(schema, { q: "b", sort: "old" });
    expect(withoutPage[0]).toBe(0b10);
    expect(decodePayload(schema, withoutPage)).toEqual({ page: undefined, sort: "old", q: "b" });

    // a payload with the default's bit cleared still decodes to the default
    expect(decodePayload(schema, new Uint8Array([0b00, 1, 0x63]))).toEqual({ page: undefined, sort: "new", q: "c" });
  });

  it("uses a declared default when a required-with-default field is omitted", () => {
    expect(roundTrip({ count: uint().default(5) }, {})).toEqual({ count: 5 });
  });

  it("rejects missing, mistyped or out-of-range values with TK2001", () => {
    const cases: Array<[CallbackSchema, Record<string, unknown>, RegExp]> = [
      [{ id: uint() }, {}, /"id" majburiy/],
      [{ id: uint() }, { id: "7" }, /"id" number bo'lishi kerak/],
      [{ id: uint() }, { id: -1 }, /manfiy bo'lmagan/],
      [{ n: int() }, { n: "x" }, /"n" number/],
      [{ n: int() }, { n: 1.5 }, /xavfsiz butun son/],
      [{ role: enumOf(["a", "b"]) }, { role: "c" }, /"c" qiymati \[a, b\] orasida emas/],
      [{ q: str(3) }, { q: 42 }, /"q" string/],
      [{ q: str(3) }, { q: "uzun" }, /maksimal 3 belgidan oshdi/],
      [{ ref: uuidField() }, { ref: 5 }, /UUID string/],
      [{ ref: uuidField() }, { ref: "not-a-uuid" }, /UUID format/],
    ];

    for (const [schema, data, message] of cases) {
      expect(() => encodePayload(schema, data)).toThrow(message);
      expect(() => encodePayload(schema, data)).toThrow(ValidationError);
    }
  });

  it("supports at most 8 optional fields per schema", () => {
    const schema = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`f${i}`, bool().optional()]));
    expect(() => encodePayload(schema, {})).toThrow(/8 tadan ortiq optional/);
  });

  it("fails decoding truncated payloads and unknown enum indexes with TK2101", () => {
    expect(() => decodePayload({ id: uint() }, new Uint8Array([]))).toThrow(/kutilmagan tugash/);
    expect(() => decodePayload({ ref: uuidField() }, new Uint8Array([1, 2, 3]))).toThrow(/kutilmagan tugash/);
    expect(() => decodePayload({ role: enumOf(["a"]) }, new Uint8Array([5]))).toThrow(/noto'g'ri enum indeksi \(5\)/);
  });
});

describe("ByteWriter / ByteReader", () => {
  it("encodes varints in LEB128 and zigzag without 32-bit truncation", () => {
    const writer = new ByteWriter();
    writer.writeVarint(300);
    writer.writeZigzagVarint(-1);
    writer.writeVarint(Number.MAX_SAFE_INTEGER);
    writer.writeString("ok");
    expect(writer.length).toBe(1 + 2 + 1 + 8 + 3 - 1);

    const reader = new ByteReader(writer.toBytes());
    expect(reader.readVarint()).toBe(300);
    expect(reader.readZigzagVarint()).toBe(-1);
    expect(reader.readVarint()).toBe(Number.MAX_SAFE_INTEGER);
    expect(reader.readString()).toBe("ok");
    expect(reader.remaining).toBe(0);
  });

  it("rejects unsafe integers", () => {
    expect(() => new ByteWriter().writeVarint(2 ** 60)).toThrow(/xavfsiz butun son/);
    expect(() => new ByteWriter().writeZigzagVarint(Number.NaN)).toThrow(/xavfsiz butun son/);
  });
});
