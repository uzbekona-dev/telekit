import { describe, expect, it } from "vitest";
import {
  CaptionTooLongError,
  FileTooLargeError,
  PhotoTooLargeError,
  TextTooLongError,
  UploadTooLargeError,
} from "../../src/media/errors.js";
import {
  MEDIA_LIMITS,
  assertCaptionLength,
  assertDownloadSize,
  assertPhotoSize,
  assertTextLength,
  assertUploadSize,
} from "../../src/media/limits.js";

describe("media limits", () => {
  it("assertDownloadSize passes at exactly the limit and throws FileTooLargeError (TK1105) over it", () => {
    expect(() => assertDownloadSize(MEDIA_LIMITS.downloadBytes)).not.toThrow();
    expect(() => assertDownloadSize(MEDIA_LIMITS.downloadBytes + 1)).toThrow(FileTooLargeError);
    try {
      assertDownloadSize(MEDIA_LIMITS.downloadBytes + 1);
    } catch (err) {
      expect((err as FileTooLargeError).code).toBe("TK1105");
    }
  });

  it("assertUploadSize throws UploadTooLargeError (TK1106) over the limit", () => {
    expect(() => assertUploadSize(MEDIA_LIMITS.uploadBytes)).not.toThrow();
    expect(() => assertUploadSize(MEDIA_LIMITS.uploadBytes + 1)).toThrow(UploadTooLargeError);
    try {
      assertUploadSize(MEDIA_LIMITS.uploadBytes + 1);
    } catch (err) {
      expect((err as UploadTooLargeError).code).toBe("TK1106");
    }
  });

  it("assertPhotoSize throws PhotoTooLargeError (TK1107) over the limit", () => {
    expect(() => assertPhotoSize(MEDIA_LIMITS.photoBytes)).not.toThrow();
    expect(() => assertPhotoSize(MEDIA_LIMITS.photoBytes + 1)).toThrow(PhotoTooLargeError);
    try {
      assertPhotoSize(MEDIA_LIMITS.photoBytes + 1);
    } catch (err) {
      expect((err as PhotoTooLargeError).code).toBe("TK1107");
    }
  });

  it("assertTextLength throws TextTooLongError (TK2004) over the limit", () => {
    expect(() => assertTextLength("a".repeat(MEDIA_LIMITS.textChars))).not.toThrow();
    expect(() => assertTextLength("a".repeat(MEDIA_LIMITS.textChars + 1))).toThrow(TextTooLongError);
    try {
      assertTextLength("a".repeat(MEDIA_LIMITS.textChars + 1));
    } catch (err) {
      expect((err as TextTooLongError).code).toBe("TK2004");
    }
  });

  it("assertCaptionLength throws CaptionTooLongError (TK2005) over the limit, and ignores undefined", () => {
    expect(() => assertCaptionLength(undefined)).not.toThrow();
    expect(() => assertCaptionLength("a".repeat(MEDIA_LIMITS.captionChars))).not.toThrow();
    expect(() => assertCaptionLength("a".repeat(MEDIA_LIMITS.captionChars + 1))).toThrow(CaptionTooLongError);
    try {
      assertCaptionLength("a".repeat(MEDIA_LIMITS.captionChars + 1));
    } catch (err) {
      expect((err as CaptionTooLongError).code).toBe("TK2005");
    }
  });
});
