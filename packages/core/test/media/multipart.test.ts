import { describe, expect, it } from "vitest";
import { InputFile } from "../../src/media/input-file.js";
import { prepareMediaGroup } from "../../src/media/multipart.js";

describe("prepareMediaGroup", () => {
  it("rewrites InputFile items to attach:// references and hoists them into attachments", () => {
    const photo = InputFile.buffer(new Uint8Array([1, 2, 3]), "a.jpg");
    const { media, attachments } = prepareMediaGroup([
      { type: "photo", media: photo, caption: "Birinchi" },
      { type: "photo", media: "AgACAgIAAxkBAAI..." },
    ]);

    expect(media).toEqual([
      { type: "photo", media: "attach://telekit_file_0", caption: "Birinchi" },
      { type: "photo", media: "AgACAgIAAxkBAAI..." },
    ]);
    expect(Object.keys(attachments)).toEqual(["telekit_file_0"]);
    expect(attachments.telekit_file_0).toBe(photo);
  });

  it("gives every InputFile item a distinct attachment key, indexed by position", () => {
    const a = InputFile.buffer(new Uint8Array([1]), "a.jpg");
    const b = InputFile.buffer(new Uint8Array([2]), "b.jpg");
    const { media, attachments } = prepareMediaGroup([
      { type: "photo", media: a },
      { type: "photo", media: b },
    ]);

    expect(media[0]?.media).toBe("attach://telekit_file_0");
    expect(media[1]?.media).toBe("attach://telekit_file_1");
    expect(attachments).toEqual({ telekit_file_0: a, telekit_file_1: b });
  });

  it("passes through file_id/url strings unchanged with no attachments", () => {
    const { media, attachments } = prepareMediaGroup([
      { type: "photo", media: "https://example.com/a.jpg" },
      { type: "video", media: "AgACAgIAAxkBAAI..." },
    ]);

    expect(media).toEqual([
      { type: "photo", media: "https://example.com/a.jpg" },
      { type: "video", media: "AgACAgIAAxkBAAI..." },
    ]);
    expect(attachments).toEqual({});
  });
});
