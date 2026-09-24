import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ConfigurationError } from "../errors.js";
import { flattenMessages, type NestedMessages } from "./messages.js";

/** `resources[locale][key] = template` — `key` is `"<namespace>.<dotted path>"`, e.g. `"bot.orders.count"` (spec §26.1). */
export type LocaleResources = Record<string, Record<string, string>>;

/**
 * Scans `resources/locales/<locale>/<namespace>.json` (spec §26.1). Every
 * `.json` file directly under a locale directory becomes one namespace —
 * `bot.json` → keys prefixed `bot.`, `errors.json` → `errors.`, etc.
 */
export async function loadLocaleResources(dir: string): Promise<LocaleResources> {
  const resources: LocaleResources = {};
  if (!existsSync(dir)) return resources;

  const localeEntries = await readdir(dir, { withFileTypes: true });
  for (const localeEntry of localeEntries) {
    if (!localeEntry.isDirectory()) continue;
    const locale = localeEntry.name;
    const localeDir = path.join(dir, locale);
    resources[locale] = {};

    const files = await readdir(localeDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      const namespace = file.name.slice(0, -".json".length);
      const raw = await readFile(path.join(localeDir, file.name), "utf8");

      let parsed: NestedMessages;
      try {
        parsed = JSON.parse(raw) as NestedMessages;
      } catch (err) {
        throw new ConfigurationError(
          "TK1006",
          `${path.join(locale, file.name)} — JSON parse xatosi: ${String(err)}`,
        );
      }

      const flat = flattenMessages(parsed);
      for (const [key, value] of Object.entries(flat)) {
        resources[locale]![`${namespace}.${key}`] = value;
      }
    }
  }

  return resources;
}
