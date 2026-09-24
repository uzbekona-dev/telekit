import { afterEach, describe, expect, it } from "vitest";
import { ValidationError } from "../src/errors.js";
import { configureKeyboardDecorators } from "../src/keyboard-decorators.js";
import { btn, keyboard } from "../src/keyboard.js";
import { NOOP_CALLBACK_DATA, paginator } from "../src/paginator.js";

describe("btn", () => {
  it("callback() builds an inline button with callback_data", () => {
    expect(btn.callback("Profil", "abcd.AQ.12345678")).toEqual({
      text: "Profil",
      callback_data: "abcd.AQ.12345678",
    });
  });

  it("callback() rejects callback_data over Telegram's 64-byte limit", () => {
    expect(() => btn.callback("x", "a".repeat(65))).toThrow(ValidationError);
  });

  it("url() builds a link button", () => {
    expect(btn.url("Sayt", "https://example.com")).toEqual({ text: "Sayt", url: "https://example.com" });
  });

  it("webApp() builds a web_app button", () => {
    expect(btn.webApp("Do'kon", "https://shop.example.com")).toEqual({
      text: "Do'kon",
      web_app: { url: "https://shop.example.com" },
    });
  });
});

describe("keyboard()", () => {
  it("builds a single row from one .row() call", () => {
    const kb = keyboard().row(btn.callback("A", "a"), btn.callback("B", "b"));
    expect(kb.inline_keyboard).toEqual([
      [
        { text: "A", callback_data: "a" },
        { text: "B", callback_data: "b" },
      ],
    ]);
  });

  it("chains multiple .row() calls into multiple rows, in order", () => {
    const kb = keyboard()
      .row(btn.callback("Profile", "p"))
      .row(btn.url("Site", "https://example.com"), btn.webApp("Shop", "https://shop.example.com"));

    expect(kb.inline_keyboard).toEqual([
      [{ text: "Profile", callback_data: "p" }],
      [
        { text: "Site", url: "https://example.com" },
        { text: "Shop", web_app: { url: "https://shop.example.com" } },
      ],
    ]);
  });

  it("is directly usable as reply_markup (structurally an InlineKeyboardMarkup)", () => {
    const kb = keyboard().row(btn.callback("A", "a"));
    const replyMarkup: { inline_keyboard: unknown } = kb;
    expect(replyMarkup.inline_keyboard).toHaveLength(1);
  });

  it("returns an empty inline_keyboard when no rows were added", () => {
    expect(keyboard().inline_keyboard).toEqual([]);
  });

  it("serializes to {inline_keyboard: [...]} over JSON.stringify, not the builder's private fields", () => {
    // Regression: class accessors are non-enumerable, so JSON.stringify()
    // ignores `get inline_keyboard()` unless the class also defines toJSON()
    // — exactly what every outgoing `sendMessage`/`editMessageText` call does
    // to build its request body. Without toJSON(), Telegram silently drops
    // the reply_markup because the wire shape doesn't match any known type.
    const kb = keyboard().row(btn.callback("A", "a"));
    const wire = JSON.parse(JSON.stringify({ reply_markup: kb }));

    expect(wire).toEqual({ reply_markup: { inline_keyboard: [[{ text: "A", callback_data: "a" }]] } });
  });

  it("grid() chunks items into fixed-width rows", () => {
    const kb = keyboard().grid([1, 2, 3, 4, 5], { columns: 2, map: (n) => btn.callback(String(n), `n${n}`) });

    expect(kb.inline_keyboard).toEqual([
      [{ text: "1", callback_data: "n1" }, { text: "2", callback_data: "n2" }],
      [{ text: "3", callback_data: "n3" }, { text: "4", callback_data: "n4" }],
      [{ text: "5", callback_data: "n5" }],
    ]);
  });

  it("auto() wraps buttons into rows once the width budget is exceeded", () => {
    const items = ["aaaa", "bbbb", "cc", "dddddddddddd"];
    const kb = keyboard().auto(items, { maxWidth: 10, map: (t) => btn.callback(t, t) });

    // "aaaa"(4) + "bbbb"(4) = 8 <= 10, + "cc"(2) = 10 <= 10 -> all fit row 1;
    // "dddddddddddd"(12) alone starts row 2 (a single button is never split).
    expect(kb.inline_keyboard).toEqual([
      [
        { text: "aaaa", callback_data: "aaaa" },
        { text: "bbbb", callback_data: "bbbb" },
        { text: "cc", callback_data: "cc" },
      ],
      [{ text: "dddddddddddd", callback_data: "dddddddddddd" }],
    ]);
  });

  it("auto() accepts pre-built buttons without a map function", () => {
    const kb = keyboard().auto([btn.callback("A", "a")], { maxWidth: 5 });
    expect(kb.inline_keyboard).toEqual([[{ text: "A", callback_data: "a" }]]);
  });
});

describe("keyboard style decorators", () => {
  afterEach(() => {
    configureKeyboardDecorators({ enabled: false, styles: {} });
  });

  it("is a no-op when decorators are not configured", () => {
    expect(btn.callback("O'chirish", "a", { style: "danger" })).toEqual({ text: "O'chirish", callback_data: "a" });
  });

  it("is a no-op when disabled, even with styles registered", () => {
    configureKeyboardDecorators({ enabled: false, styles: { danger: { prefix: "🗑 " } } });
    expect(btn.callback("O'chirish", "a", { style: "danger" }).text).toBe("O'chirish");
  });

  it("applies the configured prefix/suffix when enabled", () => {
    configureKeyboardDecorators({ enabled: true, styles: { danger: { prefix: "🗑 " }, success: { suffix: " ✅" } } });

    expect(btn.callback("O'chirish", "a", { style: "danger" }).text).toBe("🗑 O'chirish");
    expect(btn.callback("Tasdiqlash", "b", { style: "success" }).text).toBe("Tasdiqlash ✅");
  });

  it("leaves text unchanged for an unknown style name", () => {
    configureKeyboardDecorators({ enabled: true, styles: { danger: { prefix: "🗑 " } } });
    expect(btn.callback("X", "a", { style: "unknown" }).text).toBe("X");
  });

  it("applies to url() and webApp() buttons too", () => {
    configureKeyboardDecorators({ enabled: true, styles: { primary: { prefix: "▸ " } } });
    expect(btn.url("Sayt", "https://example.com", { style: "primary" }).text).toBe("▸ Sayt");
    expect(btn.webApp("Shop", "https://x.com", { style: "primary" }).text).toBe("▸ Shop");
  });
});

describe("paginator()", () => {
  const cb = (page: number) => `page.${page}`;

  it("renders prev/counter/next in a single row", () => {
    const kb = paginator({ page: 2, total: 7, callback: cb });
    expect(kb.inline_keyboard).toEqual([
      [
        { text: "‹", callback_data: "page.1" },
        { text: "2/7", callback_data: NOOP_CALLBACK_DATA },
        { text: "›", callback_data: "page.3" },
      ],
    ]);
  });

  it("disables prev on the first page", () => {
    const kb = paginator({ page: 1, total: 7, callback: cb });
    expect(kb.inline_keyboard[0]![0]).toEqual({ text: "‹", callback_data: NOOP_CALLBACK_DATA });
  });

  it("disables next on the last page", () => {
    const kb = paginator({ page: 7, total: 7, callback: cb });
    expect(kb.inline_keyboard[0]![2]).toEqual({ text: "›", callback_data: NOOP_CALLBACK_DATA });
  });

  it("supports custom labels with {page}/{total} interpolation", () => {
    const kb = paginator({ page: 3, total: 5, callback: cb, labels: { prev: "<", next: ">", counter: "Sahifa {page} / {total}" } });
    expect(kb.inline_keyboard).toEqual([
      [
        { text: "<", callback_data: "page.2" },
        { text: "Sahifa 3 / 5", callback_data: NOOP_CALLBACK_DATA },
        { text: ">", callback_data: "page.4" },
      ],
    ]);
  });
});
