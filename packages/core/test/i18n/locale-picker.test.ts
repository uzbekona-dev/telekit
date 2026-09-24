import { describe, expect, it } from "vitest";
import { LOCALE_CALLBACK_PREFIX, localePicker } from "../../src/i18n/locale-picker.js";

describe("localePicker", () => {
  it("builds one row per locale with the default label and lang: callback_data", () => {
    const kb = localePicker(["uz", "ru", "en"]);
    expect(kb.inline_keyboard).toEqual([
      [{ text: "O'zbekcha", callback_data: "lang:uz" }],
      [{ text: "Русский", callback_data: "lang:ru" }],
      [{ text: "English", callback_data: "lang:en" }],
    ]);
  });

  it("uses the provided label override when given", () => {
    const kb = localePicker(["uz"], { uz: "Uzbek (custom)" });
    expect(kb.inline_keyboard[0]![0]!.text).toBe("Uzbek (custom)");
  });

  it("falls back to the raw locale code for an unknown locale with no label", () => {
    const kb = localePicker(["fr"]);
    expect(kb.inline_keyboard[0]![0]).toEqual({ text: "fr", callback_data: `${LOCALE_CALLBACK_PREFIX}fr` });
  });
});
