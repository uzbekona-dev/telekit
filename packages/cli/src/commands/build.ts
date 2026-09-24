import { existsSync } from "node:fs";
import path from "node:path";
import { runNode } from "../process.js";
import { resolveFromProject } from "../resolve-from-project.js";
import type { CommandOptions } from "./options.js";

/** Type-checks and emits the project to `dist/` via the project's own `tsc` (spec §90). */
export async function runBuild(options: CommandOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const tsconfigPath = path.join(cwd, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    throw new Error("tsconfig.json topilmadi. Bu telekit loyihasimi?");
  }

  const tscBin = resolveFromProject(cwd, "typescript/bin/tsc");
  console.log("Build boshlandi (tsc)...\n");

  const exitCode = await runNode([tscBin, "-p", tsconfigPath], { cwd });
  if (exitCode === 0) {
    console.log("\n✓ Build tugadi → dist/");
  }
  return exitCode;
}
