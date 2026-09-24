import { describe, expect, it } from "vitest";
import { escapeHtml, escapeParams, raw } from "../../src/i18n/escape.js";

describe("escapeHtml", () => {
  it("escapes the 5 HTML-sensitive characters", () => {
    expect(escapeHtml(`<b>&"'</b>`)).toBe("&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Ali Valiyev")).toBe("Ali Valiyev");
  });
});

describe("escapeParams", () => {
  it("escapes string params", () => {
    expect(escapeParams({ name: "<b>hack</b>" })).toEqual({ name: "&lt;b&gt;hack&lt;/b&gt;" });
  });

  it("leaves non-string params (numbers, dates) untouched", () => {
    expect(escapeParams({ count: 5, active: true })).toEqual({ count: 5, active: true });
  });

  it("passes raw()-wrapped values through unescaped", () => {
    expect(escapeParams({ link: raw('<a href="/x">link</a>') })).toEqual({ link: '<a href="/x">link</a>' });
  });

  it("returns undefined for undefined input", () => {
    expect(escapeParams(undefined)).toBeUndefined();
  });
});
