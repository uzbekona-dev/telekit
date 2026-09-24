import { randomBytes } from "node:crypto";
import type { TelekitConfig } from "./config.js";

/** `telekit key:generate` prints this — a fresh base64-encoded 32-byte key for `APP_KEY`. */
export function generateAppKey(): string {
  return randomBytes(32).toString("base64");
}

/**
 * Resolves the signing key as a Buffer. `defineConfig` already rejects a
 * missing `APP_KEY` in production (spec §40.2), so an empty key here only
 * happens in development/test — in that case a random key is generated once
 * per process so callback signatures stay internally consistent for the
 * life of that run, but never survive a restart (acceptable for local dev;
 * production always sets a real, stable `APP_KEY`).
 */
export function resolveAppKey(config: Pick<TelekitConfig, "app">): Buffer {
  if (config.app.key) return Buffer.from(config.app.key, "base64");
  return randomBytes(32);
}
