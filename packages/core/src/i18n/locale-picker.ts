import { btn, keyboard, type InlineKeyboardBuilder } from "../keyboard.js";

/**
 * `callback_data` prefix for locale-switch buttons. Deliberately a plain,
 * unsigned literal (like `NOOP_CALLBACK_DATA`) rather than a signed
 * `defineCallback` route — `@telekit/core` can't depend on `@telekit/callbacks`
 * (wrong direction), and a locale choice isn't privileged enough to need
 * HMAC signing. `Application` intercepts it directly (spec §26.4).
 */
export const LOCALE_CALLBACK_PREFIX = "lang:";

/** Human-readable label per locale code — extend/override for locales beyond the common defaults. */
const DEFAULT_LOCALE_LABELS: Record<string, string> = {
  uz: "O'zbekcha",
  ru: "Русский",
  en: "English",
};

/** Built-in language-picker keyboard (spec §26.4) — pairs with `Application`'s automatic `lang:<code>` handling. */
export function localePicker(locales: string[], labels: Record<string, string> = {}): InlineKeyboardBuilder {
  const kb = keyboard();
  for (const locale of locales) {
    const label = labels[locale] ?? DEFAULT_LOCALE_LABELS[locale] ?? locale;
    kb.row(btn.callback(label, `${LOCALE_CALLBACK_PREFIX}${locale}`));
  }
  return kb;
}
