import type {
  InlineKeyboardMarkup,
  InlineQueryResult,
  InlineQueryResultArticle,
  InlineQueryResultCachedDocument,
  InlineQueryResultCachedPhoto,
  InlineQueryResultCachedSticker,
  InlineQueryResultPhoto,
  InputTextMessageContent,
} from "@telekit/types";
import { ValidationError } from "./errors.js";

/** Bot API limits for `answerInlineQuery` (spec Appendix D). */
export const INLINE_LIMITS = {
  /** Results per answer; anything beyond is paged with `next_offset`. */
  maxResults: 50,
  /** `InlineQueryResult.id` length, in UTF-8 bytes. */
  maxIdBytes: 64,
} as const;

/** Throws before the request is sent — Telegram rejects the whole answer for any one of these, with a far vaguer error. */
export function assertInlineResults(results: readonly InlineQueryResult[]): void {
  if (results.length > INLINE_LIMITS.maxResults) {
    throw new ValidationError(
      "TK2001",
      `answerInline(): ${results.length} ta natija — Telegram ko'pi bilan ${INLINE_LIMITS.maxResults} tasini qabul qiladi (qolganini next_offset bilan sahifalang)`,
    );
  }

  const seen = new Set<string>();
  for (const { id } of results) {
    const bytes = Buffer.byteLength(id, "utf8");
    if (bytes === 0 || bytes > INLINE_LIMITS.maxIdBytes) {
      throw new ValidationError("TK2001", `answerInline(): natija id'si 1–${INLINE_LIMITS.maxIdBytes} bayt bo'lishi kerak, "${id}" ${bytes} bayt`);
    }
    if (seen.has(id)) {
      throw new ValidationError("TK2001", `answerInline(): "${id}" id'si takrorlangan — har natija id'si unikal bo'lishi kerak`);
    }
    seen.add(id);
  }
}

/** Fields every builder accepts on top of its required ones. */
interface ResultExtras {
  reply_markup?: InlineKeyboardMarkup;
}

interface ArticleExtras extends ResultExtras {
  description?: string;
  parse_mode?: string;
  /** Hides the link preview of the sent message (on by default in Telegram). */
  disablePreview?: boolean;
}

interface MediaExtras extends ResultExtras {
  title?: string;
  description?: string;
  caption?: string;
  parse_mode?: string;
}

function textContent(text: string, extras: ArticleExtras): InputTextMessageContent {
  return {
    message_text: text,
    ...(extras.parse_mode !== undefined ? { parse_mode: extras.parse_mode } : {}),
    ...(extras.disablePreview ? { link_preview_options: { is_disabled: true } } : {}),
  };
}

/**
 * Short builders for the most common inline results — `inlineResult.article(id, title, text)`
 * instead of hand-writing `{ type, id, title, input_message_content: { message_text } }`.
 * Any other result type can still be passed to `ctx.answerInline()` as a plain object.
 */
export const inlineResult = {
  /** A text message the user sends by picking the result. */
  article(id: string, title: string, text: string, extras: ArticleExtras = {}): InlineQueryResultArticle {
    const { description, reply_markup } = extras;
    return {
      type: "article",
      id,
      title,
      input_message_content: textContent(text, extras),
      ...(description !== undefined ? { description } : {}),
      ...(reply_markup !== undefined ? { reply_markup } : {}),
    };
  },

  /** A photo Telegram fetches from `photoUrl` (JPEG, ≤ 5 MB); `thumbnailUrl` defaults to the photo itself. */
  photo(id: string, photoUrl: string, extras: MediaExtras & { thumbnailUrl?: string } = {}): InlineQueryResultPhoto {
    const { thumbnailUrl, ...rest } = extras;
    return { type: "photo", id, photo_url: photoUrl, thumbnail_url: thumbnailUrl ?? photoUrl, ...rest };
  },

  /** A photo already uploaded to Telegram, by `file_id`. */
  cachedPhoto(id: string, fileId: string, extras: MediaExtras = {}): InlineQueryResultCachedPhoto {
    return { type: "photo", id, photo_file_id: fileId, ...extras };
  },

  /** A document already uploaded to Telegram, by `file_id`. */
  cachedDocument(id: string, title: string, fileId: string, extras: Omit<MediaExtras, "title"> = {}): InlineQueryResultCachedDocument {
    return { type: "document", id, title, document_file_id: fileId, ...extras };
  },

  /** A sticker, by `file_id`. */
  cachedSticker(id: string, fileId: string, extras: ResultExtras = {}): InlineQueryResultCachedSticker {
    return { type: "sticker", id, sticker_file_id: fileId, ...extras };
  },
};

export interface InlinePage<T> {
  items: T[];
  /** Pass as `next_offset` — `""` means this was the last page, so Telegram stops asking. */
  nextOffset: string;
}

/**
 * Slices `items` for one inline answer. Telegram echoes the previous
 * `next_offset` back as `ctx.inlineQuery.offset` when the user scrolls.
 * The first request's `""` — or anything else that isn't a non-negative
 * integer — starts from the top; an offset past the end yields an empty,
 * final page (restarting there would make the client page forever).
 */
export function inlinePage<T>(items: readonly T[], offset: string, pageSize: number = INLINE_LIMITS.maxResults): InlinePage<T> {
  const size = Math.min(Math.max(1, Math.floor(pageSize)), INLINE_LIMITS.maxResults);
  const start = /^\d+$/.test(offset) ? Number(offset) : 0;
  const end = start + size;
  return { items: items.slice(start, end), nextOffset: end < items.length ? String(end) : "" };
}
