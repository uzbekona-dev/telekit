import type {
  AnswerCallbackQueryParams,
  AnswerInlineQueryParams,
  CallbackQuery,
  Chat,
  ChosenInlineResult,
  EditMessageTextParams,
  FileInput,
  InlineQuery,
  InlineQueryResult,
  Message,
  SendAudioParams,
  SendDocumentParams,
  SendMessageParams,
  SendPhotoParams,
  SendVideoParams,
  Update,
  User,
} from "@telekit/types";
import type { Kysely } from "kysely";
import type { TelekitDatabase, TelekitUser } from "./db/index.js";
import { ValidationError } from "./errors.js";
import { assertInlineResults } from "./inline.js";
import type { Logger } from "./logger.js";
import { downloadFile, type DownloadedFile } from "./media/download.js";
import { assertCaptionLength, assertTextLength } from "./media/limits.js";
import { prepareMediaGroup, type MediaGroupItemInput } from "./media/multipart.js";
import { splitText } from "./media/split.js";
import type { TelegramApi } from "./telegram/client.js";

/** `split: true` sends `text` as ordered chunks instead of throwing when it exceeds Telegram's 4096-char limit (spec §27.3). */
export type ReplyOptions = Omit<SendMessageParams, "chat_id" | "text"> & { split?: boolean };
export type EditTextOptions = Omit<EditMessageTextParams, "chat_id" | "message_id" | "text">;
export type PhotoOptions = Omit<SendPhotoParams, "chat_id" | "photo">;
export type DocumentOptions = Omit<SendDocumentParams, "chat_id" | "document">;
export type VideoOptions = Omit<SendVideoParams, "chat_id" | "video">;
export type AudioOptions = Omit<SendAudioParams, "chat_id" | "audio">;
/** `cache_time`, `is_personal`, `next_offset`, `button` — see `inlinePage()` for `next_offset`. */
export type AnswerInlineOptions = Omit<AnswerInlineQueryParams, "inline_query_id" | "results">;

/**
 * Per-update request object handed to middleware and handlers. Raw Telegram
 * fields (`update`, `message`, `chat`, `from`, `callback`) keep the Bot
 * API's own snake_case shape unchanged; only Telekit's own additions
 * (`reply`, `log`, `state`, ...) are camelCase — see ADR-002 in the spec.
 */
export interface Context {
  readonly update: Update;
  readonly message?: Message;
  readonly chat?: Chat;
  readonly from?: User;
  readonly callback?: CallbackQuery;
  /** Set on `inline_query` updates — the user typed `@yourbot <query>` in some chat (inline mode must be enabled in @BotFather). */
  readonly inlineQuery?: InlineQuery;
  /** Set on `chosen_inline_result` updates — needs inline feedback enabled in @BotFather. */
  readonly chosenInlineResult?: ChosenInlineResult;

  readonly api: TelegramApi;
  readonly log: Logger;
  /** `undefined` when `database.driver === "none"` (spec §9, Minimal template). */
  readonly db?: Kysely<TelekitDatabase>;
  /** Populated by the built-in user-upsert step for any update carrying a real Telegram user; `undefined` without a database. */
  readonly user?: TelekitUser;
  /** Populated by `@telekit/sessions`' `sessions()` middleware, if installed; `undefined` otherwise or when no chat can be resolved (spec §19). */
  readonly session?: Record<string, unknown>;
  /** Scratch space for middleware to pass data down the chain to handlers. */
  readonly state: Record<string, unknown>;

  /** Resolved via `locale.strategy` (spec §26.3) — the project's default locale if `loadLocales()` was never called. */
  readonly locale: string;
  /** ICU-formatted translation (spec §26.1). Without `loadLocales()`, falls back to returning `key` unchanged. */
  t(key: string, params?: Record<string, unknown>): string;

  reply(text: string, options?: ReplyOptions): Promise<Message>;
  editText(text: string, options?: EditTextOptions): Promise<Message | true>;
  deleteMessage(messageId?: number): Promise<true>;
  answerCallback(options?: Omit<AnswerCallbackQueryParams, "callback_query_id">): Promise<true>;
  /** Answers the current inline query; results are checked against Telegram's limits first (≤ 50, unique 1–64-byte ids). */
  answerInline(results: InlineQueryResult[], options?: AnswerInlineOptions): Promise<true>;

  /** `photo` accepts `InputFile.path/buffer/stream/url(...)`, a `file_id`, or a raw URL string (spec §27.1). */
  replyWithPhoto(photo: FileInput, options?: PhotoOptions): Promise<Message>;
  replyWithDocument(document: FileInput, options?: DocumentOptions): Promise<Message>;
  replyWithVideo(video: FileInput, options?: VideoOptions): Promise<Message>;
  replyWithAudio(audio: FileInput, options?: AudioOptions): Promise<Message>;
  replyWithMediaGroup(items: MediaGroupItemInput[]): Promise<Message[]>;

  /** Downloads a Telegram-hosted file to a local temp handle (spec §27.2); rejects over the 20 MB `getFile` limit. */
  download(fileId: string): Promise<DownloadedFile>;
}

export interface ContextDeps {
  api: TelegramApi;
  log: Logger;
  db?: Kysely<TelekitDatabase>;
  user?: TelekitUser;
  locale: string;
  t: (key: string, params?: Record<string, unknown>) => string;
}

export function resolveMessage(update: Update): Message | undefined {
  return update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post;
}

/** The Telegram user who triggered this update, if any (spec §30.1 upsert step uses this). */
export function extractFrom(update: Update): User | undefined {
  const message = resolveMessage(update);
  const callback = update.callback_query;
  return (
    message?.from ??
    callback?.from ??
    update.inline_query?.from ??
    update.chosen_inline_result?.from ??
    update.chat_member?.from
  );
}

export function createContext(update: Update, deps: ContextDeps): Context {
  const message = resolveMessage(update);
  const callback = update.callback_query;
  const chat = message?.chat ?? callback?.message?.chat;
  const from = extractFrom(update);
  const targetMessageId = message?.message_id ?? callback?.message?.message_id;

  const log = deps.log.child({ update_id: update.update_id });

  return {
    update,
    message,
    chat,
    from,
    callback,
    inlineQuery: update.inline_query,
    chosenInlineResult: update.chosen_inline_result,
    api: deps.api,
    log,
    db: deps.db,
    user: deps.user,
    state: {},
    locale: deps.locale,
    t: deps.t,

    async reply(text, options) {
      if (!chat) {
        throw new ValidationError(
          "TK2001",
          "ctx.reply() chaqirildi, lekin bu update uchun chat mavjud emas (masalan, inline_query)",
        );
      }
      const { split, ...sendOptions } = options ?? {};
      if (!split) {
        assertTextLength(text);
        return deps.api.sendMessage({ chat_id: chat.id, text, ...sendOptions });
      }
      let last: Message | undefined;
      for (const part of splitText(text)) {
        last = await deps.api.sendMessage({ chat_id: chat.id, text: part, ...sendOptions });
      }
      return last!;
    },

    async replyWithPhoto(photo, options) {
      if (!chat) {
        throw new ValidationError("TK2001", "ctx.replyWithPhoto() chaqirildi, lekin bu update uchun chat mavjud emas");
      }
      assertCaptionLength(options?.caption);
      return deps.api.sendPhoto({ chat_id: chat.id, photo, ...options });
    },

    async replyWithDocument(document, options) {
      if (!chat) {
        throw new ValidationError("TK2001", "ctx.replyWithDocument() chaqirildi, lekin bu update uchun chat mavjud emas");
      }
      assertCaptionLength(options?.caption);
      return deps.api.sendDocument({ chat_id: chat.id, document, ...options });
    },

    async replyWithVideo(video, options) {
      if (!chat) {
        throw new ValidationError("TK2001", "ctx.replyWithVideo() chaqirildi, lekin bu update uchun chat mavjud emas");
      }
      assertCaptionLength(options?.caption);
      return deps.api.sendVideo({ chat_id: chat.id, video, ...options });
    },

    async replyWithAudio(audio, options) {
      if (!chat) {
        throw new ValidationError("TK2001", "ctx.replyWithAudio() chaqirildi, lekin bu update uchun chat mavjud emas");
      }
      assertCaptionLength(options?.caption);
      return deps.api.sendAudio({ chat_id: chat.id, audio, ...options });
    },

    async replyWithMediaGroup(items) {
      if (!chat) {
        throw new ValidationError("TK2001", "ctx.replyWithMediaGroup() chaqirildi, lekin bu update uchun chat mavjud emas");
      }
      const { media, attachments } = prepareMediaGroup(items);
      return deps.api.raw<Message[]>("sendMediaGroup", { chat_id: chat.id, media, ...attachments });
    },

    async download(fileId) {
      return downloadFile(deps.api, fileId);
    },

    async editText(text, options) {
      if (!chat || targetMessageId === undefined) {
        throw new ValidationError(
          "TK2001",
          "ctx.editText() uchun tahrirlanadigan xabar aniqlanmadi",
        );
      }
      return deps.api.editMessageText({ chat_id: chat.id, message_id: targetMessageId, text, ...options });
    },

    async deleteMessage(messageId) {
      const id = messageId ?? targetMessageId;
      if (!chat || id === undefined) {
        throw new ValidationError("TK2001", "ctx.deleteMessage() uchun xabar aniqlanmadi");
      }
      return deps.api.deleteMessage({ chat_id: chat.id, message_id: id });
    },

    async answerCallback(options) {
      if (!callback) {
        throw new ValidationError(
          "TK2001",
          "ctx.answerCallback() faqat callback_query update'ida ishlaydi",
        );
      }
      return deps.api.answerCallbackQuery({ callback_query_id: callback.id, ...options });
    },

    async answerInline(results, options) {
      const query = update.inline_query;
      if (!query) {
        throw new ValidationError("TK2001", "ctx.answerInline() faqat inline_query update'ida ishlaydi");
      }
      assertInlineResults(results);
      return deps.api.answerInlineQuery({ ...options, inline_query_id: query.id, results });
    },
  };
}
