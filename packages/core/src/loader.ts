import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Application } from "./application.js";

const ROUTE_FILE_PATTERN = /\.(ts|mts|cts|js|mjs|cjs)$/;
const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[tj]s$/;

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith("_")) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
      continue;
    }
    if (entry.name.endsWith(".d.ts")) continue;
    if (TEST_FILE_PATTERN.test(entry.name)) continue;
    if (!ROUTE_FILE_PATTERN.test(entry.name)) continue;
    files.push(full);
  }

  return files;
}

export interface LoadRoutesOptions {
  cwd?: string;
  commandsDir?: string;
  eventsDir?: string;
  inlineDir?: string;
}

export interface LoadRoutesResult {
  commands: number;
  events: number;
  inline: number;
}

/**
 * Scans `app/commands`, `app/events` and `app/inline` and registers whatever each file
 * default-exports (spec §15.1–§15.2). v0.1 always scans at startup — the
 * build-time manifest + lazy chunk loading described in §15.2 is a later
 * milestone; this is the straightforward version that works correctly today.
 */
export async function loadRoutes(app: Application, options: LoadRoutesOptions = {}): Promise<LoadRoutesResult> {
  const cwd = options.cwd ?? process.cwd();
  const commandsDir = options.commandsDir ?? path.join(cwd, "app", "commands");
  const eventsDir = options.eventsDir ?? path.join(cwd, "app", "events");
  const inlineDir = options.inlineDir ?? path.join(cwd, "app", "inline");

  const result: LoadRoutesResult = { commands: 0, events: 0, inline: 0 };

  if (existsSync(commandsDir)) {
    for (const file of await walk(commandsDir)) {
      const mod = (await import(pathToFileURL(file).href)) as { default?: unknown };
      const def = mod.default as { handle?: unknown; name?: unknown } | undefined;
      if (def && typeof def.handle === "function" && typeof def.name === "string") {
        app.router.registerCommand(def as Parameters<Application["router"]["registerCommand"]>[0]);
        result.commands++;
      }
    }
  }

  if (existsSync(eventsDir)) {
    for (const file of await walk(eventsDir)) {
      const mod = (await import(pathToFileURL(file).href)) as { default?: unknown };
      const def = mod.default as { handle?: unknown; type?: unknown } | undefined;
      if (def && typeof def.handle === "function" && typeof def.type === "string") {
        app.router.registerEvent(def as Parameters<Application["router"]["registerEvent"]>[0]);
        result.events++;
      }
    }
  }

  if (existsSync(inlineDir)) {
    for (const file of await walk(inlineDir)) {
      const mod = (await import(pathToFileURL(file).href)) as { default?: unknown };
      const def = mod.default as { handle?: unknown; match?: unknown } | undefined;
      const validMatch = def?.match === undefined || typeof def.match === "string" || def.match instanceof RegExp;
      if (def && typeof def.handle === "function" && validMatch) {
        app.router.registerInline(def as Parameters<Application["router"]["registerInline"]>[0]);
        result.inline++;
      }
    }
  }

  return result;
}
