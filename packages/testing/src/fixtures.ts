import path from "node:path";
import type { UploadableFile } from "@telekit/core";

/** Common extensions only — enough for `mimeTypes` checks (spec §27.4) on fixture files. Pass `mime_type` explicitly for anything else. */
const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".zip": "application/zip",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export interface UploadedFixture {
  bytes: Uint8Array;
  filename?: string;
  mimeType?: string;
}

/** Reads an `InputFile` (or any `UploadableFile`) fully into memory so the fake backend can serve it back to `ctx.download()`. */
export async function readUpload(file: UploadableFile): Promise<UploadedFixture> {
  const blob = await file.toBlob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mimeType = blob.type || (file.filename ? MIME_BY_EXTENSION[path.extname(file.filename).toLowerCase()] : undefined);
  return { bytes, filename: file.filename, mimeType };
}
