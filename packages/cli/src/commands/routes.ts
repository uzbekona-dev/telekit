import { loadDotEnvCascade } from "../env-file.js";
import { assertTelekitProject, queryProject } from "../project.js";
import { buildRoutesReport, type RoutesData } from "../reports/routes.js";
import type { CommandOptions } from "./options.js";

/**
 * Runs inside the project. Scans every export (default AND named —
 * `defineCallback` handles are typically named exports, unlike commands/
 * events) of every file under `app/callbacks/`, duck-typing for the
 * `CallbackHandle` shape, and runs `@telekit/callbacks`' own
 * `createCallbackRegistry` for the collision check — the same check
 * `installCallbacks` enforces at runtime. The budget table itself is
 * computed by `buildRoutesReport`, back in the CLI.
 */
const RUNNER_SOURCE = [
  'import { readdir } from "node:fs/promises";',
  'import { existsSync, writeFileSync } from "node:fs";',
  'import path from "node:path";',
  'import { pathToFileURL } from "node:url";',
  'import * as callbacks from "@telekit/callbacks";',
  "",
  "async function walk(dir) {",
  "  const entries = await readdir(dir, { withFileTypes: true });",
  "  const files = [];",
  "  for (const entry of entries) {",
  "    if (entry.name.startsWith('_')) continue;",
  "    const full = path.join(dir, entry.name);",
  "    if (entry.isDirectory()) { files.push(...(await walk(full))); continue; }",
  "    if (!/\\.(ts|mts|cts|js|mjs|cjs)$/.test(entry.name)) continue;",
  "    if (/\\.(test|spec)\\.[cm]?[tj]s$/.test(entry.name)) continue;",
  "    files.push(full);",
  "  }",
  "  return files;",
  "}",
  "",
  "function looksLikeCallbackHandle(value) {",
  "  return typeof value === 'function' && typeof value.name === 'string' && typeof value.routeId === 'string' && value.routeId.length === 4 && typeof value.schema === 'object';",
  "}",
  "",
  "const [resultFile] = process.argv.slice(2);",
  "const dir = path.join(process.cwd(), 'app', 'callbacks');",
  "const handles = [];",
  "if (existsSync(dir)) {",
  "  for (const file of await walk(dir)) {",
  "    const mod = await import(pathToFileURL(file).href);",
  "    for (const value of Object.values(mod)) {",
  "      if (looksLikeCallbackHandle(value)) handles.push(value);",
  "    }",
  "  }",
  "}",
  "",
  "let collision = null;",
  "if (handles.length > 0) {",
  "  try {",
  "    callbacks.createCallbackRegistry(handles);",
  "  } catch (err) {",
  "    collision = err instanceof Error ? err.message : String(err);",
  "  }",
  "}",
  "",
  "writeFileSync(resultFile, JSON.stringify({",
  "  budget: callbacks.MAX_INLINE_PAYLOAD_BYTES ?? 37,",
  "  collision,",
  "  handles: handles.map((h) => ({",
  "    name: h.name,",
  "    routeId: h.routeId,",
  "    fields: Object.values(h.schema).map((f) => ({",
  "      kind: f.def.kind, optional: f.def.optional, maxLength: f.def.maxLength, enumValues: f.def.enumValues,",
  "    })),",
  "  })),",
  "}));",
  "",
].join("\n");

/** `telekit routes` — per-callback routeId/budget report + build-time collision check (spec §23.3, ADR-003). */
export async function runRoutes(options: CommandOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  loadDotEnvCascade(cwd);
  assertTelekitProject(cwd);

  const data = await queryProject<RoutesData>(cwd, "routes", RUNNER_SOURCE);
  const report = buildRoutesReport(data);
  for (const line of report.lines) console.log(line);
  return report.exitCode;
}
