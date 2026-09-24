import { ValidationError } from "../errors.js";

const UNIT_BYTES: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
};

/** Parses sizes like "500KB", "5MB", "1.5 GB", or a bare byte count into bytes. */
export function parseSize(input: string | number): number {
  if (typeof input === "number") return input;
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(input.trim());
  if (!match) {
    throw new ValidationError(
      "TK2002",
      `Noto'g'ri hajm formati: "${input}" (masalan: "500KB", "5MB", "1.5GB")`,
    );
  }
  const [, amount, unit] = match as unknown as [string, string, string | undefined];
  return Math.round(Number(amount) * UNIT_BYTES[(unit ?? "b").toLowerCase()]!);
}
