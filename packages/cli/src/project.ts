import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveTsxCli, runNode } from "./process.js";

/** Every project-scoped command's first check — fails fast outside a `telekit new` project. */
export function assertTelekitProject(cwd: string): void {
  if (!existsSync(path.join(cwd, "telekit.config.ts")) && !existsSync(path.join(cwd, "telekit.config.js"))) {
    throw new Error("telekit.config.ts topilmadi. Bu papka telekit loyihasimi?");
  }
}

function runnerDir(cwd: string): string {
  const dir = path.join(cwd, ".telekit");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Writes `source` to `<cwd>/.telekit/<name>-runner.mjs` and runs it through
 * tsx *inside the project*, so `@telekit/*` and `telekit.config.ts` resolve
 * to the project's own installed copies — not the CLI's. Regenerated on every
 * invocation, so a runner never goes stale after a CLI upgrade.
 */
export async function runProjectScript(cwd: string, name: string, source: string, args: string[] = []): Promise<number> {
  const runner = path.join(runnerDir(cwd), `${name}-runner.mjs`);
  writeFileSync(runner, source, "utf8");
  return runNode([resolveTsxCli(), runner, ...args], { cwd });
}

/**
 * Like `runProjectScript`, for runners that only *collect* data: the runner
 * gets a result-file path as its first argument and writes JSON there; all
 * reporting logic then runs here, in the CLI, where it is typed and tested.
 * A file (not stdout) keeps the data clean of anything project code logs.
 */
export async function queryProject<T>(cwd: string, name: string, source: string): Promise<T> {
  const resultFile = path.join(runnerDir(cwd), `${name}-result.json`);
  rmSync(resultFile, { force: true });
  try {
    const exitCode = await runProjectScript(cwd, name, source, [resultFile]);
    if (exitCode !== 0) throw new Error(`${name}: loyiha skripti ${exitCode} kodi bilan tugadi`);
    if (!existsSync(resultFile)) throw new Error(`${name}: loyiha skripti natija yozmadi`);
    return JSON.parse(readFileSync(resultFile, "utf8")) as T;
  } finally {
    rmSync(resultFile, { force: true });
  }
}
