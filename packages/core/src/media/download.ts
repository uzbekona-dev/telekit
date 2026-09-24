import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { ValidationError } from "../errors.js";
import type { TelegramApi } from "../telegram/client.js";
import { assertDownloadSize } from "./limits.js";

export interface DownloadedFile {
  /** Local temp-file path — valid until `dispose()`. */
  readonly path: string;
  saveTo(destination: string): Promise<void>;
  buffer(): Promise<Buffer>;
  stream(): NodeJS.ReadableStream;
  dispose(): Promise<void>;
}

/**
 * Downloads a Telegram file to a local temp file (spec §27.2). Rejects with
 * `FileTooLargeError` (TK1105) before ever starting the transfer if
 * `getFile` reports a size over the 20 MB `getFile` limit.
 */
export async function downloadFile(api: TelegramApi, fileId: string): Promise<DownloadedFile> {
  const file = await api.getFile({ file_id: fileId });
  if (file.file_size !== undefined) assertDownloadSize(file.file_size);
  if (!file.file_path) {
    throw new ValidationError("TK2001", `getFile("${fileId}") file_path qaytarmadi`);
  }

  const response = await api.downloadFile(file.file_path);
  if (!response.body) {
    throw new ValidationError("TK2001", "Yuklab olingan fayl tanasi bo'sh");
  }

  const dir = await mkdtemp(join(tmpdir(), "telekit-"));
  const localPath = join(dir, file.file_path.split("/").pop() ?? "file");
  await pipeline(Readable.fromWeb(response.body as WebReadableStream<Uint8Array>), createWriteStream(localPath));

  let disposed = false;
  return {
    path: localPath,
    async saveTo(destination) {
      await copyFile(localPath, destination);
    },
    async buffer() {
      return readFile(localPath);
    },
    stream() {
      return createReadStream(localPath);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await rm(dir, { recursive: true, force: true });
    },
  };
}

