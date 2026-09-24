import { loadDotEnvCascade } from "../env-file.js";
import { assertTelekitProject, runProjectScript } from "../project.js";
import type { CommandOptions } from "./options.js";

/**
 * Runs inside the project (see `runProjectScript`) so `@telekit/core` and
 * `telekit.config.ts` resolve to the project's own copies. Other packages'
 * migrations come from `database.migrations.providers` via
 * `resolveMigrationProviders` — the same list `Application` checks at
 * startup, so a TK1050 "pending migrations" error is always fixable here.
 */
const RUNNER_SOURCE = `import * as core from "@telekit/core";
import config from "../telekit.config.js";

const mode = process.argv[2];
const db = core.createDatabase(config.database);

if (!db) {
  console.error('database.driver="none" — migratsiya kerak emas.');
  process.exit(1);
}

const dialect = config.database.driver;
// An older @telekit/core without resolveMigrationProviders only knows its own migrations.
const providers = core.resolveMigrationProviders ? core.resolveMigrationProviders(config.database) : [];

if (mode === "status") {
  const status = await core.getMigrationStatus(db, dialect, providers);
  for (const name of status.executed) console.log(\`\\u2713 \${name}\`);
  for (const name of status.pending) console.log(\`\\u2026 \${name}  (kutilmoqda)\`);
  if (status.pending.length === 0) console.log("\\nBarcha migratsiyalar qo'llangan.");
  await db.destroy();
  process.exit(status.pending.length > 0 ? 1 : 0);
}

const result = await core.runMigrations(db, dialect, providers);
for (const r of result.results ?? []) {
  console.log(r.status === "Success" ? \`\\u2713 \${r.migrationName}\` : \`\\u2717 \${r.migrationName}\`);
}
console.log(\`\\n\${(result.results ?? []).length} ta migratsiya qo'llandi.\`);
await db.destroy();
`;

/** `telekit migrate` / `telekit migrate:status`. */
export async function runMigrate(subcommand: "latest" | "status", options: CommandOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  loadDotEnvCascade(cwd);
  assertTelekitProject(cwd);
  return runProjectScript(cwd, "migrate", RUNNER_SOURCE, [subcommand]);
}
