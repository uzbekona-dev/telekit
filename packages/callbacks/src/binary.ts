import { ValidationError } from "@telekit/core";

/**
 * LEB128 varint + zigzag helpers, using plain arithmetic (`*`, `%`,
 * `Math.floor`) rather than JS's 32-bit bitwise operators — Telegram user
 * and chat ids routinely exceed 2^32 (e.g. bot ids like `8790370872`), so
 * `<<`/`>>>` would silently corrupt them.
 */

export class ByteWriter {
  private readonly bytes: number[] = [];

  writeByte(value: number): void {
    this.bytes.push(value & 0xff);
  }

  writeVarint(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ValidationError("TK2001", `uint() manfiy bo'lmagan xavfsiz butun son kutadi, "${value}" keldi`);
    }
    let remaining = value;
    while (remaining >= 0x80) {
      this.bytes.push((remaining % 0x80) + 0x80);
      remaining = Math.floor(remaining / 0x80);
    }
    this.bytes.push(remaining);
  }

  writeZigzagVarint(value: number): void {
    if (!Number.isSafeInteger(value)) {
      throw new ValidationError("TK2001", `int() xavfsiz butun son kutadi, "${value}" keldi`);
    }
    this.writeVarint(value >= 0 ? value * 2 : -value * 2 - 1);
  }

  writeBytes(bytes: Uint8Array): void {
    for (const b of bytes) this.bytes.push(b);
  }

  writeString(value: string): void {
    const encoded = new TextEncoder().encode(value);
    this.writeVarint(encoded.length);
    this.writeBytes(encoded);
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }

  get length(): number {
    return this.bytes.length;
  }
}

export class ByteReader {
  private cursor = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get remaining(): number {
    return this.bytes.length - this.cursor;
  }

  private assertAvailable(n: number): void {
    if (this.remaining < n) {
      throw new ValidationError("TK2101", "Callback payload'ni dekodlashda kutilmagan tugash");
    }
  }

  readByte(): number {
    this.assertAvailable(1);
    return this.bytes[this.cursor++]!;
  }

  readVarint(): number {
    let result = 0;
    let multiplier = 1;
    let byte: number;
    do {
      byte = this.readByte();
      result += (byte & 0x7f) * multiplier;
      multiplier *= 0x80;
    } while (byte & 0x80);
    return result;
  }

  readZigzagVarint(): number {
    const encoded = this.readVarint();
    return encoded % 2 === 0 ? encoded / 2 : -(encoded + 1) / 2;
  }

  readBytes(n: number): Uint8Array {
    this.assertAvailable(n);
    const slice = this.bytes.subarray(this.cursor, this.cursor + n);
    this.cursor += n;
    return slice;
  }

  readString(): string {
    const length = this.readVarint();
    return new TextDecoder().decode(this.readBytes(length));
  }
}
