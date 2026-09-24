import { existsSync } from "node:fs";
import path from "node:path";
import { loadDotEnvCascade } from "../env-file.js";
import { runNode } from "../process.js";
import type { CommandOptions } from "./options.js";

/** The built entry `telekit build` produced — `dist/main.js`, or `dist/src/main.js` for `src/`-rooted projects. */
export function resolveCompiledEntry(cwd: string): string {
  for (const candidate of ["dist/main.js", "dist/src/main.js"]) {
    const full = path.join(cwd, candidate);
    if (existsSync(full)) return full;
  }
  throw new Error('dist/main.js topilmadi. Avval "telekit build" ishga tushiring.');
}

/** Runs the already-built project directly with `node` — no TS tooling in the production path (spec §90). */
export async function runStart(options: CommandOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  loadDotEnvCascade(cwd, "production");

  const entry = resolveCompiledEntry(cwd);
  const env = { ...process.env, APP_ENV: process.env.APP_ENV ?? "production" };

  return runNode([entry], { cwd, env, forwardSignals: true });
}
