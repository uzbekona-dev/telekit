import { describe, expect, it } from "vitest";
import { buildI18nReport } from "../src/reports/i18n.js";
import { buildRoutesReport, estimateMaxPayloadBytes, fieldMaxBytes } from "../src/reports/routes.js";

describe("buildI18nReport", () => {
  it("reports every namespace as ✓ when all locales have the reference keys", () => {
    const report = buildI18nReport(
      {
        uz: { "bot.welcome": "Salom", "errors.unexpected": "Xato" },
        ru: { "bot.welcome": "Привет", "errors.unexpected": "Ошибка" },
      },
      "uz",
    );

    expect(report.hasProblems).toBe(false);
    expect(report.lines).toEqual([
      "ru/bot.json        ✓",
      "ru/errors.json        ✓",
      "",
      "uz/bot.json        ✓  (reference)",
      "uz/errors.json        ✓  (reference)",
    ]);
  });

  it("lists missing keys per namespace and extra keys overall, locale by locale", () => {
    const report = buildI18nReport(
      {
        uz: { "bot.a": "1", "bot.b": "2", "menu.x": "3" },
        ru: { "bot.a": "1", "bot.zz": "extra", "old.y": "extra" },
        en: { "bot.a": "1", "bot.b": "2", "menu.x": "3" },
      },
      "uz",
    );

    expect(report.hasProblems).toBe(true);
    expect(report.lines).toEqual([
      "en/bot.json        ✓",
      "en/menu.json        ✓",
      "",
      "ru/bot.json        1 ta kalit yetishmayapti",
      "  bot.b",
      "ru/menu.json        1 ta kalit yetishmayapti",
      "  menu.x",
      "",
      "2 ta ortiqcha kalit: ru/bot.json → bot.zz, ru/old.json → old.y",
      "",
      "uz/bot.json        ✓  (reference)",
      "uz/menu.json        ✓  (reference)",
    ]);
  });

  it("only-extra keys still count as a problem", () => {
    expect(buildI18nReport({ uz: { "a.b": "1" }, ru: { "a.b": "1", "a.c": "2" } }, "uz").hasProblems).toBe(true);
  });

  it("errors out when the reference locale has no resources", () => {
    const report = buildI18nReport({ ru: { "bot.a": "1" } }, "uz");
    expect(report.error).toBe('Reference locale "uz" uchun resources/locales/uz/ topilmadi.');
    expect(report.lines).toEqual([]);
  });
});

describe("callback payload budget", () => {
  it("sizes each field kind at its worst case", () => {
    expect(fieldMaxBytes({ kind: "bool" })).toBe(1);
    expect(fieldMaxBytes({ kind: "uuid" })).toBe(16);
    expect(fieldMaxBytes({ kind: "uint" })).toBe(8);
    expect(fieldMaxBytes({ kind: "int" })).toBe(8);
    expect(fieldMaxBytes({ kind: "enum", enumValues: ["a", "b"] })).toBe(1);
    expect(fieldMaxBytes({ kind: "enum", enumValues: Array.from({ length: 200 }, (_, i) => `v${i}`) })).toBe(2);
    expect(fieldMaxBytes({ kind: "enum" })).toBe(1);
    expect(fieldMaxBytes({ kind: "str", maxLength: 5 })).toBe(1 + 20);
    expect(fieldMaxBytes({ kind: "str", maxLength: 200 })).toBe(2 + 800);
    expect(fieldMaxBytes({ kind: "str" })).toBe(Number.POSITIVE_INFINITY);
    expect(fieldMaxBytes({ kind: "future-kind" })).toBe(0);
  });

  it("adds one mask byte when any field is optional", () => {
    expect(estimateMaxPayloadBytes([{ kind: "uint" }, { kind: "bool" }])).toBe(9);
    expect(estimateMaxPayloadBytes([{ kind: "uint" }, { kind: "bool", optional: true }])).toBe(10);
    expect(estimateMaxPayloadBytes([])).toBe(0);
  });
});

describe("buildRoutesReport", () => {
  it("prints a sorted budget table and flags overflowing callbacks", () => {
    const report = buildRoutesReport({
      budget: 37,
      collision: null,
      handles: [
        { name: "user.delete", routeId: "a1B2", fields: [{ kind: "uint" }] },
        { name: "search.query", routeId: "Zz09", fields: [{ kind: "str", maxLength: 20 }] },
        { name: "free.text", routeId: "Qq11", fields: [{ kind: "str" }] },
      ],
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toEqual([
      "CALLBACKS                         routeId   payload     budjet   holat",
      "free.text                         Qq11      ∞ B         37 B     ⚠ overflow → ref store",
      "search.query                      Zz09      81 B        37 B     ⚠ overflow → ref store",
      "user.delete                       a1B2      8 B         37 B     ✓",
      "",
      "3 ta callback, 2 tasi nazariy maksimalda budjetdan oshadi (ref store orqali ishlaydi).",
    ]);
  });

  it("fails on a routeId collision", () => {
    const report = buildRoutesReport({
      budget: 37,
      collision: 'Callback ID collision: "a" va "b"',
      handles: [{ name: "a", routeId: "abcd", fields: [] }],
    });

    expect(report.exitCode).toBe(1);
    expect(report.lines.slice(-3)).toEqual(["", "✖ Callback ID collision", '  Callback ID collision: "a" va "b"']);
  });

  it("says so when there are no callbacks at all", () => {
    expect(buildRoutesReport({ budget: 37, collision: null, handles: [] })).toEqual({
      lines: ["app/callbacks/ ichida hech qanday defineCallback() topilmadi."],
      exitCode: 0,
    });
  });
});
