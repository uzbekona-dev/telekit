import { describe, expect, it } from "vitest";
import { splitText } from "../../src/media/split.js";

describe("splitText", () => {
  it("returns the text unchanged when it's within the limit", () => {
    expect(splitText("salom", 10)).toEqual(["salom"]);
  });

  it("returns a single part when the text is exactly at the limit", () => {
    const text = "a".repeat(10);
    expect(splitText(text, 10)).toEqual([text]);
  });

  it("prefers a paragraph boundary over a hard cut", () => {
    const text = `${"a".repeat(5)}\n\n${"b".repeat(5)}`;
    const parts = splitText(text, 8);
    expect(parts[0]).toBe(`${"a".repeat(5)}\n\n`);
    expect(parts[1]).toBe("b".repeat(5));
  });

  it("prefers a word boundary when there's no paragraph break", () => {
    const text = "hello world this is telekit";
    const parts = splitText(text, 12);
    // Every part before a hard cut must end right after a space, never mid-word.
    for (const part of parts.slice(0, -1)) {
      expect(part.endsWith(" ")).toBe(true);
    }
  });

  it("hard-cuts a single unbreakable token longer than the limit", () => {
    const text = "x".repeat(50);
    const parts = splitText(text, 20);
    expect(parts).toEqual(["x".repeat(20), "x".repeat(20), "x".repeat(10)]);
  });

  it("returns a single empty-string part for empty input", () => {
    expect(splitText("", 10)).toEqual([""]);
  });

  it("always reconstructs the original text when parts are joined", () => {
    const text = "Assalomu alaykum!\n\nBu uzun xabar. ".repeat(50);
    const parts = splitText(text, 100);
    expect(parts.join("")).toBe(text);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(100);
    }
  });

  it("keeps ordering across many parts", () => {
    const text = Array.from({ length: 20 }, (_, i) => `part${i}`).join(" ");
    const parts = splitText(text, 15);
    expect(parts.join("")).toBe(text);
    expect(parts.length).toBeGreaterThan(1);
  });
});
