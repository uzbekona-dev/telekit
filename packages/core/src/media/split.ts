import { MEDIA_LIMITS } from "./limits.js";

/** Finds where to cut `text[0, limit)`, preferring a paragraph/line/word boundary over a hard mid-word cut. */
function findBreak(text: string, limit: number): number {
  const window = text.slice(0, limit);
  const paragraph = window.lastIndexOf("\n\n");
  if (paragraph > 0) return paragraph + 2;
  const newline = window.lastIndexOf("\n");
  if (newline > 0) return newline + 1;
  const space = window.lastIndexOf(" ");
  if (space > 0) return space + 1;
  return limit;
}

/**
 * Splits `text` into ordered chunks no longer than `limit` (default: Telegram's
 * 4096-char message limit), preferring paragraph, then line, then word
 * boundaries before falling back to a hard cut — spec §27.3's `{ split: true }`.
 * `parts.join("") === text` always holds — boundary characters stay attached
 * to the chunk before them, nothing is dropped.
 */
export function splitText(text: string, limit: number = MEDIA_LIMITS.textChars): string[] {
  if (text.length <= limit) return [text];

  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const cut = findBreak(remaining, limit);
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining.length > 0) parts.push(remaining);
  return parts;
}
