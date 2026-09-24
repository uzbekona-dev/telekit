import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Minimal `.env` parser — no interpolation, no multiline values (spec §22.1 covers the full cascade; this is the v0.1 subset). */
export function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const result: Record<string, string> = {};

  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);

    result[key] = value;
  }
  return result;
}

/**
 * Loads the `.env` cascade (spec §22.1) into `process.env`, without ever
 * overriding a variable the shell already exported — real environment
 * variables always outrank anything read from a file.
 *
 * The `APP_ENV` that picks `.env.<APP_ENV>` comes from the shell, else from
 * `.env` itself, else `defaultAppEnv` — `telekit start` passes `"production"`
 * so a production start never reads `.env.development`.
 */
export function loadDotEnvCascade(cwd: string, defaultAppEnv = "development"): void {
  const shellKeys = new Set(Object.keys(process.env));
  const base = parseEnvFile(path.join(cwd, ".env"));
  const appEnv = process.env.APP_ENV ?? base.APP_ENV ?? defaultAppEnv;
  const files = [`.env.${appEnv}`, ".env.local", `.env.${appEnv}.local`];

  const merged: Record<string, string> = { ...base };
  for (const file of files) {
    Object.assign(merged, parseEnvFile(path.join(cwd, file)));
  }
  for (const [key, value] of Object.entries(merged)) {
    if (!shellKeys.has(key)) process.env[key] = value;
  }
}
