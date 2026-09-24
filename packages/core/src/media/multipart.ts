import type { InputMedia } from "@telekit/types";
import { InputFile, isInputFile } from "./input-file.js";

export interface MediaGroupItemInput {
  type: "photo" | "video" | "document" | "audio" | "animation";
  media: InputFile | string;
  caption?: string;
  parse_mode?: string;
  width?: number;
  height?: number;
  duration?: number;
  performer?: string;
  title?: string;
}

export interface PreparedMediaGroup {
  media: InputMedia[];
  /** Synthetic top-level params (`{ telekit_file_0: InputFile, ... }`) to spread alongside `media` — `TelegramApi`'s multipart detection (Phase 0) only inspects top-level param values, so files nested inside the `media` array must be hoisted out here first. */
  attachments: Record<string, InputFile>;
}

/**
 * Rewrites a media-group item list for `sendMediaGroup` (spec §27.1): each
 * `InputFile` becomes an `attach://<key>` reference in the wire-level
 * `InputMedia`, with the actual file hoisted into `attachments`.
 */
export function prepareMediaGroup(items: MediaGroupItemInput[]): PreparedMediaGroup {
  const attachments: Record<string, InputFile> = {};
  const media = items.map((item, index) => {
    if (isInputFile(item.media)) {
      const key = `telekit_file_${index}`;
      attachments[key] = item.media;
      return { ...item, media: `attach://${key}` } as InputMedia;
    }
    return { ...item, media: item.media } as InputMedia;
  });
  return { media, attachments };
}
