import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/errors.js";
import { parseSize } from "../src/util/size.js";

describe("parseSize", () => {
  it("parses byte counts with each unit", () => {
    expect(parseSize("500b")).toBe(500);
    expect(parseSize("500kb")).toBe(500 * 1024);
    expect(parseSize("5MB")).toBe(5 * 1024 ** 2);
    expect(parseSize("1.5 GB")).toBe(Math.round(1.5 * 1024 ** 3));
  });

  it("treats a bare number as raw bytes", () => {
    expect(parseSize(1024)).toBe(1024);
    expect(parseSize("2048")).toBe(2048);
  });

  it("is case-insensitive on the unit", () => {
    expect(parseSize("5mb")).toBe(parseSize("5MB"));
  });

  it("throws ValidationError for an invalid format", () => {
    expect(() => parseSize("five megabytes")).toThrow(ValidationError);
    expect(() => parseSize("5 TB")).toThrow(ValidationError);
    expect(() => parseSize("")).toThrow(ValidationError);
  });
});
