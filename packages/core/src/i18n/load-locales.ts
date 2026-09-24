import { existsSync } from "node:fs";
import path from "node:path";
import type { Application } from "../application.js";
import { loadLocaleResources } from "./loader.js";
import { Translator, type LocaleStrategyName } from "./translator.js";

export interface LoadLocalesOptions {
  cwd?: string;
  /** Relative to `cwd` — default `resources/locales` (spec §26.1). */
  dir?: string;
  /** Default: `app.config.app.locale`. */
  defaultLocale?: string;
  /** Default: same as `defaultLocale`. */
  fallbackLocale?: string;
  /** Default: `["user", "telegram", "project"]` (spec §26.3). */
  strategy?: LocaleStrategyName[];
}

/**
 * Scans `resources/locales/` and installs the resulting `Translator` on
 * `app`, powering `ctx.t()`/`ctx.locale` from then on. Call once at startup,
 * before `app.start()` — mirrors `loadRoutes(app)`'s file-based-loader shape
 * (spec §15.1) applied to locale resources instead of route files.
 */
export async function loadLocales(app: Application, options: LoadLocalesOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const dir = path.join(cwd, options.dir ?? "resources/locales");

  const resources = existsSync(dir) ? await loadLocaleResources(dir) : {};
  const defaultLocale = options.defaultLocale ?? app.config.app.locale;

  const translator = new Translator({
    resources,
    defaultLocale,
    fallbackLocale: options.fallbackLocale ?? defaultLocale,
    strategy: options.strategy,
    productionFallback: app.config.app.env === "production",
    onMissingKey: (locale, key) => {
      app.log.warn({ event: "i18n.missing_key", locale, key }, `Tarjima kaliti topilmadi: "${key}"`);
    },
  });

  app.setTranslator(translator);
}
