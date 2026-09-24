import IntlMessageFormat from "intl-messageformat";
import { TelekitError } from "../errors.js";
import { escapeParams } from "./escape.js";
import type { LocaleResources } from "./loader.js";

export class MissingTranslationKeyError extends TelekitError {
  constructor(locale: string, key: string) {
    super("TK2401", `Tarjima kaliti topilmadi: "${key}" (locale="${locale}")`);
  }
}

/** `"user"`/`"telegram"`/`"project"` are the built-in sources (spec §26.3); a function is a project-supplied custom source. */
export type LocaleStrategyName = "user" | "telegram" | "project" | "custom";

export interface LocaleCandidates {
  userLocale?: string | null;
  telegramLanguageCode?: string | null;
  customLocale?: string | null;
}

export interface TranslatorOptions {
  resources: LocaleResources;
  /** Also acts as the "project" strategy's source and the ultimate fallback if `fallbackLocale` isn't set. */
  defaultLocale: string;
  fallbackLocale?: string;
  /** Defaults to every locale actually present in `resources`. */
  supportedLocales?: string[];
  strategy?: LocaleStrategyName[];
  /** `true` (production): a missing key silently returns the key itself + logs; `false` (development): throws. */
  productionFallback?: boolean;
  onMissingKey?: (locale: string, key: string) => void;
}

/** `ru-RU` → `ru`, `uz_Latn` → `uz` — Telegram's `language_code` doesn't always match a configured locale exactly. */
function normalizeLocaleTag(tag: string): string {
  return tag.split(/[-_]/)[0]!.toLowerCase();
}

/**
 * Resolves per-update locale (spec §26.3) and formats ICU messages (spec
 * §26.1, via `intl-messageformat` — real plural-rule support, not naive
 * `{{count}}` interpolation). Compiled `IntlMessageFormat` instances are
 * cached per `(locale, key)` since parsing ICU syntax on every `ctx.t()`
 * call would be wasteful — the template text never changes at runtime.
 */
export class Translator {
  private readonly resources: LocaleResources;
  private readonly defaultLocale: string;
  private readonly fallbackLocale: string;
  private readonly supportedLocales: Set<string>;
  private readonly strategy: LocaleStrategyName[];
  private readonly productionFallback: boolean;
  private readonly onMissingKey?: (locale: string, key: string) => void;
  private readonly compiled = new Map<string, IntlMessageFormat>();

  constructor(options: TranslatorOptions) {
    this.resources = options.resources;
    this.defaultLocale = options.defaultLocale;
    this.fallbackLocale = options.fallbackLocale ?? options.defaultLocale;
    this.supportedLocales = new Set(options.supportedLocales ?? Object.keys(options.resources));
    this.strategy = options.strategy ?? ["user", "telegram", "project"];
    this.productionFallback = options.productionFallback ?? false;
    this.onMissingKey = options.onMissingKey;
  }

  listSupportedLocales(): string[] {
    return [...this.supportedLocales];
  }

  /** Walks `strategy` in order, stopping at the first candidate that matches a supported locale (spec §26.3). */
  resolveLocale(candidates: LocaleCandidates): string {
    for (const source of this.strategy) {
      const raw =
        source === "user"
          ? candidates.userLocale
          : source === "telegram"
            ? candidates.telegramLanguageCode
            : source === "custom"
              ? candidates.customLocale
              : this.defaultLocale;
      if (!raw) continue;
      const normalized = normalizeLocaleTag(raw);
      if (this.supportedLocales.has(normalized)) return normalized;
      if (this.supportedLocales.has(raw)) return raw;
    }
    return this.fallbackLocale;
  }

  private template(locale: string, key: string): string | undefined {
    return this.resources[locale]?.[key] ?? this.resources[this.fallbackLocale]?.[key];
  }

  private compile(locale: string, key: string, template: string): IntlMessageFormat {
    const cacheKey = `${locale}\0${key}`;
    let msg = this.compiled.get(cacheKey);
    if (!msg) {
      msg = new IntlMessageFormat(template, locale);
      this.compiled.set(cacheKey, msg);
    }
    return msg;
  }

  translate(locale: string, key: string, params?: Record<string, unknown>): string {
    const template = this.template(locale, key);
    if (template === undefined) {
      this.onMissingKey?.(locale, key);
      if (this.productionFallback) return key;
      throw new MissingTranslationKeyError(locale, key);
    }

    const formatted = this.compile(locale, key, template).format(escapeParams(params));
    return Array.isArray(formatted) ? formatted.join("") : String(formatted);
  }
}
