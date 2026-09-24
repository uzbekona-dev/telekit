import { ValidationError } from "../errors.js";

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parses durations like "10s", "5m", "24h", "7d" into milliseconds. */
export function parseDuration(input: string | number): number {
  if (typeof input === "number") return input;
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new ValidationError(
      "TK2001",
      `Noto'g'ri davomiylik formati: "${input}" (masalan: "10s", "5m", "24h", "7d" kutilgan)`,
    );
  }
  const [, amount, unit] = match as unknown as [string, string, string];
  return Number(amount) * UNIT_MS[unit]!;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal!.reason ?? new Error("aborted"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
