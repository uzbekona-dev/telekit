import { describe, expect, it } from "vitest";
import { matchesMime, validateIncomingFile } from "../../src/media/validate.js";

describe("matchesMime", () => {
  it("matches an exact mime type", () => {
    expect(matchesMime("application/pdf", "application/pdf")).toBe(true);
    expect(matchesMime("application/pdf", "application/zip")).toBe(false);
  });

  it("matches a wildcard subtype", () => {
    expect(matchesMime("image/*", "image/png")).toBe(true);
    expect(matchesMime("image/*", "image/jpeg")).toBe(true);
    expect(matchesMime("image/*", "video/mp4")).toBe(false);
  });
});

describe("validateIncomingFile", () => {
  it("returns null when within maxSize and mimeTypes", () => {
    const reason = validateIncomingFile(
      { file_size: 1000, mime_type: "application/pdf" },
      { maxSize: "5MB", mimeTypes: ["application/pdf", "image/*"] },
    );
    expect(reason).toBeNull();
  });

  it("returns 'too_large' when file_size exceeds maxSize", () => {
    const reason = validateIncomingFile({ file_size: 6 * 1024 * 1024 }, { maxSize: "5MB" });
    expect(reason).toBe("too_large");
  });

  it("returns 'bad_type' when mime_type doesn't match any pattern", () => {
    const reason = validateIncomingFile({ mime_type: "video/mp4" }, { mimeTypes: ["application/pdf", "image/*"] });
    expect(reason).toBe("bad_type");
  });

  it("returns 'bad_type' when mime_type is missing but mimeTypes is required", () => {
    const reason = validateIncomingFile({}, { mimeTypes: ["application/pdf"] });
    expect(reason).toBe("bad_type");
  });

  it("skips the size check when file_size is missing (can't verify, trusts it)", () => {
    const reason = validateIncomingFile({}, { maxSize: "1KB" });
    expect(reason).toBeNull();
  });

  it("returns null when no constraints are given", () => {
    expect(validateIncomingFile({ file_size: 999_999_999, mime_type: "anything/whatever" }, {})).toBeNull();
  });

  it("checks size before type, but both must pass overall", () => {
    const reason = validateIncomingFile(
      { file_size: 10 * 1024 * 1024, mime_type: "video/mp4" },
      { maxSize: "5MB", mimeTypes: ["image/*"] },
    );
    expect(reason).toBe("too_large");
  });
});
