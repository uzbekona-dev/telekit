import { existsSync } from "node:fs";
import path from "node:path";
import { loadDotEnvCascade } from "../env-file.js";
import { resolveTsxCli, runNode } from "../process.js";
import type { CommandOptions } from "./options.js";

/** The project's TypeScript entry — `main.ts`, or `src/main.ts` for projects that keep sources under `src/`. */
export function resolveEntry(cwd: string): string {
  for (const candidate of ["main.ts", "src/main.ts"]) {
    const full = path.join(cwd, candidate);
    if (existsSync(full)) return full;
  }
  throw new Error('main.ts topilmadi. Bu papka "telekit new" bilan yaratilgan loyihami? (kutilgan: ./main.ts)');
}

/** Runs the project's entry file through `tsx watch` so file changes restart the bot (spec §29.3). */
export async function runDev(options: CommandOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  loadDotEnvCascade(cwd);

  const entry = resolveEntry(cwd);
  console.log(`Telekit dev server — ${path.relative(cwd, entry)} kuzatilmoqda...\n`);

  return runNode([resolveTsxCli(), "watch", entry], { cwd, forwardSignals: true });
}
