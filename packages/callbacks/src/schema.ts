import { ValidationError } from "@telekit/core";
import { ByteReader, ByteWriter } from "./binary.js";

export type FieldKind = "uint" | "int" | "bool" | "enum" | "str" | "uuid";

export interface FieldDef<T = unknown> {
  kind: FieldKind;
  optional: boolean;
  hasDefault: boolean;
  defaultValue?: T;
  enumValues?: readonly string[];
  maxLength?: number;
}

/** Immutable builder — `.optional()`/`.default()` each return a new `Field`, matching the framework's immutability rule. */
export class Field<T> {
  constructor(readonly def: FieldDef<T>) {}

  optional(): Field<T | undefined> {
    return new Field<T | undefined>({ ...this.def, optional: true });
  }

  default(value: T): Field<T> {
    return new Field<T>({ ...this.def, hasDefault: true, defaultValue: value });
  }
}

export function uint(): Field<number> {
  return new Field({ kind: "uint", optional: false, hasDefault: false });
}

export function int(): Field<number> {
  return new Field({ kind: "int", optional: false, hasDefault: false });
}

export function bool(): Field<boolean> {
  return new Field({ kind: "bool", optional: false, hasDefault: false });
}

/**
 * Named `enumOf`, not `enum` — `enum` is a reserved word in JavaScript and
 * can't be used as a function or import binding name (spec's own pseudocode
 * uses `enum(...)`, which isn't valid JS).
 */
export function enumOf<const T extends readonly string[]>(values: T): Field<T[number]> {
  return new Field({ kind: "enum", optional: false, hasDefault: false, enumValues: values });
}

export function str(maxLength: number): Field<string> {
  return new Field({ kind: "str", optional: false, hasDefault: false, maxLength });
}

export function uuidField(): Field<string> {
  return new Field({ kind: "uuid", optional: false, hasDefault: false });
}

export type InferField<F> = F extends Field<infer T> ? T : never;
export type CallbackSchema = Record<string, Field<any>>;
export type InferSchema<TSchema extends CallbackSchema> = { [K in keyof TSchema]: InferField<TSchema[K]> };

const MAX_OPTIONAL_FIELDS = 8;

function fieldTypeError(key: string, expected: string): ValidationError {
  return new ValidationError("TK2001", `Callback payload maydoni "${key}" ${expected} bo'lishi kerak`);
}

function uuidToBytes(key: string, value: string): Uint8Array {
  const hex = value.replace(/-/g, "");
  if (hex.length !== 32 || /[^0-9a-fA-F]/.test(hex)) {
    throw fieldTypeError(key, "UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)");
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function resolveValue(key: string, def: FieldDef, data: Record<string, unknown>): unknown {
  const provided = data[key];
  if (provided !== undefined) return provided;
  if (def.hasDefault) return def.defaultValue;
  if (def.optional) return undefined;
  throw new ValidationError("TK2001", `Callback payload'da "${key}" majburiy, lekin berilmagan`);
}

function encodeField(writer: ByteWriter, key: string, def: FieldDef, value: unknown): void {
  switch (def.kind) {
    case "uint":
      if (typeof value !== "number") throw fieldTypeError(key, "number");
      writer.writeVarint(value);
      return;
    case "int":
      if (typeof value !== "number") throw fieldTypeError(key, "number");
      writer.writeZigzagVarint(value);
      return;
    case "bool":
      writer.writeByte(value ? 1 : 0);
      return;
    case "enum": {
      const index = def.enumValues!.indexOf(value as string);
      if (index === -1) {
        throw new ValidationError(
          "TK2001",
          `"${key}" uchun "${String(value)}" qiymati [${def.enumValues!.join(", ")}] orasida emas`,
        );
      }
      writer.writeVarint(index);
      return;
    }
    case "str": {
      if (typeof value !== "string") throw fieldTypeError(key, "string");
      if (def.maxLength !== undefined && value.length > def.maxLength) {
        throw new ValidationError("TK2001", `"${key}" maksimal ${def.maxLength} belgidan oshdi`);
      }
      writer.writeString(value);
      return;
    }
    case "uuid":
      if (typeof value !== "string") throw fieldTypeError(key, "UUID string");
      writer.writeBytes(uuidToBytes(key, value));
      return;
  }
}

function decodeField(reader: ByteReader, key: string, def: FieldDef): unknown {
  switch (def.kind) {
    case "uint":
      return reader.readVarint();
    case "int":
      return reader.readZigzagVarint();
    case "bool":
      return reader.readByte() !== 0;
    case "enum": {
      const index = reader.readVarint();
      const value = def.enumValues?.[index];
      if (value === undefined) {
        throw new ValidationError("TK2101", `"${key}" uchun noto'g'ri enum indeksi (${index})`);
      }
      return value;
    }
    case "str":
      return reader.readString();
    case "uuid":
      return bytesToUuid(reader.readBytes(16));
  }
}

/**
 * Binary layout (ADR-003, v0.2 subset): one optional null-mask byte (if the
 * schema has any `.optional()` fields — max 8 per schema), followed by each
 * field in declaration order. Booleans take a full byte each rather than a
 * packed bitfield — a deliberate v0.2 simplification; see ADR-003 in the
 * spec for the fully bit-packed design this could grow into later.
 */
export function encodePayload(schema: CallbackSchema, data: Record<string, unknown>): Uint8Array {
  const entries = Object.entries(schema);
  const optionalEntries = entries.filter(([, field]) => field.def.optional);
  if (optionalEntries.length > MAX_OPTIONAL_FIELDS) {
    throw new ValidationError(
      "TK2001",
      `Bitta callback schema'sida ${MAX_OPTIONAL_FIELDS} tadan ortiq optional() maydon qo'llab-quvvatlanmaydi (v0.2)`,
    );
  }

  const resolved: Record<string, unknown> = {};
  for (const [key, field] of entries) resolved[key] = resolveValue(key, field.def, data);

  const writer = new ByteWriter();

  if (optionalEntries.length > 0) {
    let mask = 0;
    optionalEntries.forEach(([key], i) => {
      if (resolved[key] !== undefined) mask |= 1 << i;
    });
    writer.writeByte(mask);
  }

  for (const [key, field] of entries) {
    const value = resolved[key];
    if (field.def.optional && value === undefined) continue;
    encodeField(writer, key, field.def, value);
  }

  return writer.toBytes();
}

export function decodePayload<TSchema extends CallbackSchema>(
  schema: TSchema,
  bytes: Uint8Array,
): InferSchema<TSchema> {
  const entries = Object.entries(schema);
  const optionalEntries = entries.filter(([, field]) => field.def.optional);
  const reader = new ByteReader(bytes);

  const mask = optionalEntries.length > 0 ? reader.readByte() : 0;

  const result: Record<string, unknown> = {};
  let optionalIndex = 0;
  for (const [key, field] of entries) {
    if (field.def.optional) {
      const present = (mask & (1 << optionalIndex)) !== 0;
      optionalIndex++;
      if (!present) {
        result[key] = field.def.hasDefault ? field.def.defaultValue : undefined;
        continue;
      }
    }
    result[key] = decodeField(reader, key, field.def);
  }
  return result as InferSchema<TSchema>;
}
