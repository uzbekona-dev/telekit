import { loadDotEnvCascade } from "../env-file.js";
import { assertTelekitProject, queryProject } from "../project.js";
import { buildI18nReport, type LocaleResources } from "../reports/i18n.js";
import type { CommandOptions } from "./options.js";

/** Runs inside the project so `@telekit/core` is the project's own copy; only loads the resources — the comparison happens in `buildI18nReport`. */
const RUNNER_SOURCE = [
  'import { writeFileSync } from "node:fs";',
  'import path from "node:path";',
  'import { loadLocaleResources } from "@telekit/core";',
  "",
  "const [resultFile] = process.argv.slice(2);",
  'const resources = await loadLocaleResources(path.join(process.cwd(), "resources", "locales"));',
  "writeFileSync(resultFile, JSON.stringify(resources));",
  "",
].join("\n");

/** `telekit i18n:check [--strict]` — reports missing/extra translation keys against the project's default locale (spec §26.6). */
export async function runI18nCheck(args: string[], options: CommandOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  loadDotEnvCascade(cwd);
  assertTelekitProject(cwd);

  const resources = await queryProject<LocaleResources>(cwd, "i18n-check", RUNNER_SOURCE);
  // APP_LOCALE directly, not telekit.config.ts — importing the config would run the
  // project's full defineConfig() validation (BOT_TOKEN, ...), none of which this needs.
  const report = buildI18nReport(resources, process.env.APP_LOCALE || "uz");
  if (report.error) {
    console.error(report.error);
    return 1;
  }

  for (const line of report.lines) console.log(line);
  return args.includes("--strict") && report.hasProblems ? 1 : 0;
}
