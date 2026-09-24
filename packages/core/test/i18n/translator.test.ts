import { describe, expect, it, vi } from "vitest";
import { raw } from "../../src/i18n/escape.js";
import { MissingTranslationKeyError, Translator } from "../../src/i18n/translator.js";

const RESOURCES = {
  uz: {
    "bot.welcome": "Salom, {name}!",
    "bot.orders.count": "{count, plural, one {# ta buyurtma} other {# ta buyurtma}}",
  },
  ru: {
    "bot.welcome": "Здравствуйте, {name}!",
    "bot.orders.count": "{count, plural, one {# заказ} few {# заказа} many {# заказов} other {# заказа}}",
  },
  en: {
    "bot.welcome": "Hello, {name}!",
    // "bot.orders.count" deliberately missing — exercises the fallback-locale path
  },
};

describe("Translator — formatting", () => {
  it("interpolates a simple placeholder", () => {
    const t = new Translator({ resources: RESOURCES, defaultLocale: "uz" });
    expect(t.translate("uz", "bot.welcome", { name: "Ali" })).toBe("Salom, Ali!");
  });

  it("formats Uzbek plurals (one/other)", () => {
    const t = new Translator({ resources: RESOURCES, defaultLocale: "uz" });
    expect(t.translate("uz", "bot.orders.count", { count: 1 })).toBe("1 ta buyurtma");
    expect(t.translate("uz", "bot.orders.count", { count: 5 })).toBe("5 ta buyurtma");
  });

  it("formats Russian's full plural set (one/few/many/other)", () => {
    const t = new Translator({ resources: RESOURCES, defaultLocale: "uz" });
    expect(t.translate("ru", "bot.orders.count", { count: 1 })).toBe("1 заказ");
    expect(t.translate("ru", "bot.orders.count", { count: 2 })).toBe("2 заказа");
    expect(t.translate("ru", "bot.orders.count", { count: 5 })).toBe("5 заказов");
    expect(t.translate("ru", "bot.orders.count", { count: 21 })).toBe("21 заказ");
  });

  it("falls back to the fallback locale for a key missing in the requested locale", () => {
    const t = new Translator({ resources: RESOURCES, defaultLocale: "uz", fallbackLocale: "uz" });
    expect(t.translate("en", "bot.orders.count", { count: 3 })).toBe("3 ta buyurtma");
  });
});

describe("Translator — HTML escaping (spec §26.5)", () => {
  it("escapes an interpolated string param", () => {
    const t = new Translator({ resources: RESOURCES, defaultLocale: "uz" });
    expect(t.translate("uz", "bot.welcome", { name: "<b>hack</b>" })).toBe("Salom, &lt;b&gt;hack&lt;/b&gt;!");
  });

  it("leaves a raw()-wrapped param unescaped", () => {
    const t = new Translator({ resources: RESOURCES, defaultLocale: "uz" });
    expect(t.translate("uz", "bot.welcome", { name: raw("<b>Ali</b>") })).toBe("Salom, <b>Ali</b>!");
  });
});

describe("Translator — missing key handling", () => {
  it("throws MissingTranslationKeyError in development mode", () => {
    const t = new Translator({ resources: RESOURCES, defaultLocale: "uz", productionFallback: false });
    expect(() => t.translate("uz", "does.not.exist")).toThrow(MissingTranslationKeyError);
  });

  it("returns the key itself in production mode, and reports via onMissingKey", () => {
    const onMissingKey = vi.fn();
    const t = new Translator({ resources: RESOURCES, defaultLocale: "uz", productionFallback: true, onMissingKey });
    expect(t.translate("uz", "does.not.exist")).toBe("does.not.exist");
    expect(onMissingKey).toHaveBeenCalledWith("uz", "does.not.exist");
  });
});

describe("Translator — locale resolution chain (spec §26.3)", () => {
  it("prefers 'user' over 'telegram' over 'project' in default strategy order", () => {
    const t = new Translator({ resources: RESOURCES, defaultLocale: "uz" });
    expect(
      t.resolveLocale({ userLocale: "ru", telegramLanguageCode: "en", customLocale: undefined }),
    ).toBe("ru");
  });

  it("falls through to 'telegram' when no user locale is set", () => {
    const t = new Translator({ resources: RESOURCES, defaultLocale: "uz" });
    expect(t.resolveLocale({ userLocale: null, telegramLanguageCode: "en" })).toBe("en");
  });

  it("normalizes a regional tag like 'ru-RU' to the supported base locale 'ru'", () => {
    const t = new Translator({ resources: RESOURCES, defaultLocale: "uz" });
    expect(t.resolveLocale({ telegramLanguageCode: "ru-RU" })).toBe("ru");
  });

  it("falls back to defaultLocale when nothing in the chain matches a supported locale", () => {
    const t = new Translator({ resources: RESOURCES, defaultLocale: "uz" });
    expect(t.resolveLocale({ telegramLanguageCode: "fr" })).toBe("uz");
  });

  it("respects a custom strategy order", () => {
    const t = new Translator({ resources: RESOURCES, defaultLocale: "uz", strategy: ["telegram", "user"] });
    expect(t.resolveLocale({ userLocale: "ru", telegramLanguageCode: "en" })).toBe("en");
  });

  it("lists exactly the locales present in resources by default", () => {
    const t = new Translator({ resources: RESOURCES, defaultLocale: "uz" });
    expect(t.listSupportedLocales().sort()).toEqual(["en", "ru", "uz"]);
  });
});
