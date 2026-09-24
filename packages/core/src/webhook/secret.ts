import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Derives a stable, unguessable value from `APP_KEY` for whichever webhook
 * secret wasn't explicitly configured (spec §14.5 — "APP_KEY dan hosil" /
 * "APP_KEY dan HMAC"). `label` keeps `secretToken` and `secretPath` from
 * ever colliding even though they share the same key.
 */
function deriveFromAppKey(key: Buffer, label: string): string {
  return createHmac("sha256", key).update(label).digest("hex");
}

/** Telegram's `X-Telegram-Bot-Api-Secret-Token` header allows 1–256 chars of `[A-Za-z0-9_-]`; a 64-char hex digest fits comfortably. */
export function resolveSecretToken(configured: string | null, appKey: Buffer): string {
  return configured || deriveFromAppKey(appKey, "webhook-secret-token");
}

/** The path segment after `/telegram/webhook/` — a second, URL-level barrier against a leaked/guessed endpoint (spec §14.5). */
export function resolveSecretPath(configured: string | null, appKey: Buffer): string {
  return configured || deriveFromAppKey(appKey, "webhook-secret-path");
}

/** Constant-time comparison — the same rationale as the callback signature check (ADR-003): a `===` here would leak timing information to an attacker probing the header. */
export function secretTokenMatches(received: string | undefined, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
