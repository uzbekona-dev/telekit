import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FileTooLargeError } from "../../src/media/errors.js";
import { downloadFile } from "../../src/media/download.js";
import { TelegramApi } from "../../src/telegram/client.js";

function fakeJsonResponse(body: unknown): Response {
  return { json: async () => body } as Response;
}

describe("downloadFile", () => {
  it("rejects with FileTooLargeError (TK1105) before downloading, when getFile reports >20MB", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.endsWith("/getFile")) {
        return fakeJsonResponse({
          ok: true,
          result: { file_id: "f1", file_unique_id: "u1", file_size: 21 * 1024 * 1024, file_path: "documents/big.pdf" },
        });
      }
      throw new Error(`should never reach the download endpoint: ${href}`);
    }) as unknown as typeof fetch;

    const api = new TelegramApi({ token: "123:test", fetchImpl });
    await expect(downloadFile(api, "f1")).rejects.toThrow(FileTooLargeError);
  });

  it("downloads to a temp file, saves a copy, reads as a buffer, and disposes idempotently", async () => {
    const bytes = new TextEncoder().encode("pdf-file-contents");
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.endsWith("/getFile")) {
        return fakeJsonResponse({
          ok: true,
          result: { file_id: "f1", file_unique_id: "u1", file_size: bytes.byteLength, file_path: "documents/report.pdf" },
        });
      }
      if (href.includes("/file/bot")) {
        return new Response(bytes, { status: 200 });
      }
      throw new Error(`unexpected call: ${href}`);
    }) as unknown as typeof fetch;

    const api = new TelegramApi({ token: "123:test", fetchImpl });
    const file = await downloadFile(api, "f1");

    expect(file.path.endsWith("report.pdf")).toBe(true);
    expect((await file.buffer()).toString()).toBe("pdf-file-contents");

    const destDir = await mkdtemp(join(tmpdir(), "telekit-saveto-"));
    const dest = join(destDir, "copy.pdf");
    try {
      await file.saveTo(dest);
      expect((await readFile(dest)).toString()).toBe("pdf-file-contents");

      await file.dispose();
      await file.dispose(); // idempotent — must not throw
      await expect(readFile(file.path)).rejects.toThrow();
    } finally {
      await rm(destDir, { recursive: true, force: true });
    }
  });

  it("dispose() after buffer() still cleans up the temp directory", async () => {
    const bytes = new TextEncoder().encode("x");
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.endsWith("/getFile")) {
        return fakeJsonResponse({ ok: true, result: { file_id: "f2", file_unique_id: "u2", file_path: "documents/x.txt" } });
      }
      return new Response(bytes, { status: 200 });
    }) as unknown as typeof fetch;

    const api = new TelegramApi({ token: "123:test", fetchImpl });
    const file = await downloadFile(api, "f2");
    await file.buffer();

    await expect(file.dispose()).resolves.not.toThrow();
    await expect(readFile(file.path)).rejects.toThrow();
  });
});
