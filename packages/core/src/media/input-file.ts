import { openAsBlob } from "node:fs";
import { basename } from "node:path";
import type { Readable } from "node:stream";
import type { UploadableFile } from "@telekit/types";

/**
 * A file to upload to Telegram (spec §27.1). `TelegramApi` detects instances
 * structurally (`UploadableFile` in `@telekit/types`) and switches to
 * multipart automatically — nothing else needs to know this class exists.
 */
export class InputFile implements UploadableFile {
  private constructor(
    readonly filename: string,
    private readonly source: () => Promise<Blob> | Blob,
    /** Known upload size in bytes, when cheap to know upfront (`.buffer()`); `undefined` for `.path()`/`.stream()`, whose size isn't worth an extra stat/read just to pre-check. */
    readonly sizeHint?: number,
  ) {}

  toBlob(): Promise<Blob> | Blob {
    return this.source();
  }

  /**
   * `fs.openAsBlob()` gives a file-backed `Blob` that `fetch`/`FormData`
   * stream lazily from disk — the file is never fully read into memory
   * (spec §27.1's streaming requirement).
   */
  static path(filePath: string, filename?: string): InputFile {
    return new InputFile(filename ?? basename(filePath), () => openAsBlob(filePath));
  }

  static buffer(data: Uint8Array | ArrayBuffer, filename: string): InputFile {
    const blob = new Blob([data]);
    return new InputFile(filename, () => blob, blob.size);
  }

  /**
   * Buffers the whole stream into memory before upload — unlike `.path()`,
   * an arbitrary `Readable` can't be hint-sized or re-opened lazily by
   * `fetch`, so there's no streaming path here without a hand-rolled
   * multipart writer. Prefer `.path()` for large files on disk.
   */
  static stream(source: Readable, filename: string): InputFile {
    return new InputFile(filename, async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of source) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike));
      }
      return new Blob(chunks);
    });
  }

  /** Not an upload — Telegram fetches the URL itself (spec §27.1). Returned as a plain string so `InputFile.url(...)` still reads naturally alongside the other constructors. */
  static url(url: string): string {
    return url;
  }
}

export function isInputFile(value: unknown): value is InputFile {
  return value instanceof InputFile;
}
