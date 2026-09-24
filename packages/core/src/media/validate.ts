import { parseSize } from "../util/size.js";

export type MediaInvalidReason = "too_large" | "bad_type";

export interface MediaFileMeta {
  file_size?: number;
  mime_type?: string;
}

export interface ValidateFileOptions {
  maxSize?: string | number;
  mimeTypes?: string[];
}

/** `pattern` may be an exact mime type ("application/pdf") or a wildcard subtype ("image/*"). */
export function matchesMime(pattern: string, mimeType: string): boolean {
  if (pattern === mimeType) return true;
  if (pattern.endsWith("/*")) return mimeType.startsWith(pattern.slice(0, -1));
  return false;
}

/**
 * Checks an incoming file's metadata against `maxSize`/`mimeTypes` (spec
 * §27.4). `mime_type` comes from Telegram and is untrusted (a client can send
 * any value) — this only does the same cheap check the spec asks core to do;
 * real content sniffing is left to the caller (documented, not enforced here).
 * Missing metadata (both fields are optional per the Bot API) is treated as
 * "can't verify" rather than a failure, for whichever check it would affect.
 */
export function validateIncomingFile(meta: MediaFileMeta, options: ValidateFileOptions): MediaInvalidReason | null {
  if (options.maxSize !== undefined && meta.file_size !== undefined) {
    if (meta.file_size > parseSize(options.maxSize)) return "too_large";
  }
  if (options.mimeTypes && options.mimeTypes.length > 0) {
    if (!meta.mime_type || !options.mimeTypes.some((pattern) => matchesMime(pattern, meta.mime_type!))) {
      return "bad_type";
    }
  }
  return null;
}
