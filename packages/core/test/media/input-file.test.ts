import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InputFile, isInputFile } from "../../src/media/input-file.js";

describe("InputFile", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "telekit-input-file-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it(".path() infers the filename from the path and streams the real file bytes", async () => {
    const filePath = join(dir, "promo.jpg");
    await writeFile(filePath, "fake-jpeg-bytes");

    const file = InputFile.path(filePath);
    expect(file.filename).toBe("promo.jpg");
    expect(isInputFile(file)).toBe(true);

    const blob = await file.toBlob();
    expect(await blob.text()).toBe("fake-jpeg-bytes");
  });

  it(".path() accepts an explicit filename override", () => {
    const file = InputFile.path(join(dir, "report_v2_final.pdf"), "report.pdf");
    expect(file.filename).toBe("report.pdf");
  });

  it(".buffer() sets sizeHint immediately from the data length", async () => {
    const data = new TextEncoder().encode("hello world");
    const file = InputFile.buffer(data, "hello.txt");

    expect(file.filename).toBe("hello.txt");
    expect(file.sizeHint).toBe(data.byteLength);
    const blob = await file.toBlob();
    expect(await blob.text()).toBe("hello world");
  });

  it(".stream() buffers an arbitrary Readable into a Blob", async () => {
    const source = Readable.from(["chunk-one-", "chunk-two"]);
    const file = InputFile.stream(source, "stream.txt");

    expect(file.sizeHint).toBeUndefined();
    const blob = await file.toBlob();
    expect(await blob.text()).toBe("chunk-one-chunk-two");
  });

  it(".url() is a plain string, not an uploadable InputFile", () => {
    const result = InputFile.url("https://example.com/pic.png");
    expect(result).toBe("https://example.com/pic.png");
    expect(isInputFile(result)).toBe(false);
  });

  it("isInputFile() rejects plain objects and strings", () => {
    expect(isInputFile({ filename: "x", toBlob: () => new Blob([]) })).toBe(false);
    expect(isInputFile("AgACAgIAAxkBAAI...")).toBe(false);
    expect(isInputFile(undefined)).toBe(false);
  });
});
