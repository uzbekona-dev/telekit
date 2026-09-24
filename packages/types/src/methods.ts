import type {
  BotCommand,
  CallbackQuery,
  Chat,
  InlineQueryResult,
  InlineQueryResultsButton,
  InputMedia,
  Message,
  ReplyMarkup,
  TelegramFile,
  User,
} from "./objects.js";
import type { Update } from "./update.js";

export type ParseMode = "HTML" | "MarkdownV2" | "Markdown";

/**
 * A field that can be sent either as a string (file_id, http url, or
 * `attach://<name>`) or as an uploadable object. `@telekit/core`'s
 * `InputFile` (spec §27.1) conforms to this shape structurally — `types`
 * stays dependency-free (ADR-006) by not importing it directly.
 */
export interface UploadableFile {
  readonly filename?: string;
  toBlob(): Promise<Blob> | Blob;
}

export type FileInput = string | UploadableFile;

export interface LinkPreviewOptions {
  is_disabled?: boolean;
  url?: string;
  prefer_small_media?: boolean;
  prefer_large_media?: boolean;
  show_above_text?: boolean;
}

export interface ReplyParameters {
  message_id: number;
  chat_id?: number | string;
  allow_sending_without_reply?: boolean;
}

// ── getMe ──────────────────────────────────────────────────

export type GetMeParams = Record<string, never>;
export type GetMeResult = User;

// ── getUpdates ─────────────────────────────────────────────

export interface GetUpdatesParams {
  offset?: number;
  limit?: number;
  timeout?: number;
  allowed_updates?: string[];
}
export type GetUpdatesResult = Update[];

// ── sendMessage ────────────────────────────────────────────

export interface SendMessageParams {
  chat_id: number | string;
  text: string;
  parse_mode?: ParseMode;
  entities?: unknown[];
  link_preview_options?: LinkPreviewOptions;
  disable_notification?: boolean;
  protect_content?: boolean;
  reply_parameters?: ReplyParameters;
  reply_markup?: ReplyMarkup;
}
export type SendMessageResult = Message;

// ── editMessageText ────────────────────────────────────────

export interface EditMessageTextParams {
  chat_id?: number | string;
  message_id?: number;
  inline_message_id?: string;
  text: string;
  parse_mode?: ParseMode;
  link_preview_options?: LinkPreviewOptions;
  reply_markup?: ReplyMarkup;
}
export type EditMessageTextResult = Message | true;

// ── deleteMessage ──────────────────────────────────────────

export interface DeleteMessageParams {
  chat_id: number | string;
  message_id: number;
}
export type DeleteMessageResult = true;

// ── answerCallbackQuery ────────────────────────────────────

export interface AnswerCallbackQueryParams {
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
  url?: string;
  cache_time?: number;
}
export type AnswerCallbackQueryResult = true;

// ── setMyCommands ──────────────────────────────────────────

export interface BotCommandScope {
  type: "default" | "all_private_chats" | "all_group_chats" | "all_chat_administrators";
}

export interface SetMyCommandsParams {
  commands: BotCommand[];
  scope?: BotCommandScope;
  language_code?: string;
}
export type SetMyCommandsResult = true;

export interface GetMyCommandsParams {
  scope?: BotCommandScope;
  language_code?: string;
}
export type GetMyCommandsResult = BotCommand[];

// ── Webhook management ──

export interface SetWebhookParams {
  url: string;
  secret_token?: string;
  max_connections?: number;
  allowed_updates?: string[];
  drop_pending_updates?: boolean;
}
export type SetWebhookResult = true;

export interface DeleteWebhookParams {
  drop_pending_updates?: boolean;
}
export type DeleteWebhookResult = true;

export type GetWebhookInfoParams = Record<string, never>;
export interface GetWebhookInfoResult {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
}

// ── Media (spec §27) ─────────────────────────────────────

export interface SendPhotoParams {
  chat_id: number | string;
  photo: FileInput;
  caption?: string;
  parse_mode?: ParseMode;
  reply_parameters?: ReplyParameters;
  reply_markup?: ReplyMarkup;
  disable_notification?: boolean;
  protect_content?: boolean;
}
export type SendPhotoResult = Message;

export interface SendDocumentParams {
  chat_id: number | string;
  document: FileInput;
  caption?: string;
  parse_mode?: ParseMode;
  reply_parameters?: ReplyParameters;
  reply_markup?: ReplyMarkup;
  disable_notification?: boolean;
  protect_content?: boolean;
}
export type SendDocumentResult = Message;

export interface SendVideoParams {
  chat_id: number | string;
  video: FileInput;
  caption?: string;
  parse_mode?: ParseMode;
  duration?: number;
  width?: number;
  height?: number;
  reply_parameters?: ReplyParameters;
  reply_markup?: ReplyMarkup;
  disable_notification?: boolean;
  protect_content?: boolean;
}
export type SendVideoResult = Message;

export interface SendAudioParams {
  chat_id: number | string;
  audio: FileInput;
  caption?: string;
  parse_mode?: ParseMode;
  duration?: number;
  performer?: string;
  title?: string;
  reply_parameters?: ReplyParameters;
  reply_markup?: ReplyMarkup;
  disable_notification?: boolean;
  protect_content?: boolean;
}
export type SendAudioResult = Message;

export interface SendMediaGroupParams {
  chat_id: number | string;
  media: InputMedia[];
  disable_notification?: boolean;
  protect_content?: boolean;
  reply_parameters?: ReplyParameters;
}
export type SendMediaGroupResult = Message[];

export interface GetFileParams {
  file_id: string;
}
export type GetFileResult = TelegramFile;

export interface EditMessageCaptionParams {
  chat_id?: number | string;
  message_id?: number;
  inline_message_id?: string;
  caption?: string;
  parse_mode?: ParseMode;
  reply_markup?: ReplyMarkup;
}
export type EditMessageCaptionResult = Message | true;

// ── Inline mode (spec routing convention, §15.1) ──────────

export interface AnswerInlineQueryParams {
  inline_query_id: string;
  results: InlineQueryResult[];
  cache_time?: number;
  is_personal?: boolean;
  next_offset?: string;
  button?: InlineQueryResultsButton;
}
export type AnswerInlineQueryResult = true;

/**
 * Method registry mapping method name -> { params, result }. `TelegramApi.call`
 * is typed against this so new raw methods can be added without touching
 * the client implementation (see ADR-001 / §18.1 in the spec: `ctx.api.raw()`
 * remains available for methods not yet in this table).
 */
export interface TelegramMethods {
  getMe: { params: GetMeParams; result: GetMeResult };
  getUpdates: { params: GetUpdatesParams; result: GetUpdatesResult };
  sendMessage: { params: SendMessageParams; result: SendMessageResult };
  editMessageText: { params: EditMessageTextParams; result: EditMessageTextResult };
  deleteMessage: { params: DeleteMessageParams; result: DeleteMessageResult };
  answerCallbackQuery: { params: AnswerCallbackQueryParams; result: AnswerCallbackQueryResult };
  setMyCommands: { params: SetMyCommandsParams; result: SetMyCommandsResult };
  getMyCommands: { params: GetMyCommandsParams; result: GetMyCommandsResult };
  setWebhook: { params: SetWebhookParams; result: SetWebhookResult };
  deleteWebhook: { params: DeleteWebhookParams; result: DeleteWebhookResult };
  getWebhookInfo: { params: GetWebhookInfoParams; result: GetWebhookInfoResult };
  sendPhoto: { params: SendPhotoParams; result: SendPhotoResult };
  sendDocument: { params: SendDocumentParams; result: SendDocumentResult };
  sendVideo: { params: SendVideoParams; result: SendVideoResult };
  sendAudio: { params: SendAudioParams; result: SendAudioResult };
  sendMediaGroup: { params: SendMediaGroupParams; result: SendMediaGroupResult };
  getFile: { params: GetFileParams; result: GetFileResult };
  editMessageCaption: { params: EditMessageCaptionParams; result: EditMessageCaptionResult };
  answerInlineQuery: { params: AnswerInlineQueryParams; result: AnswerInlineQueryResult };
}

export type TelegramMethodName = keyof TelegramMethods;

export interface ApiResponseOk<T> {
  ok: true;
  result: T;
}

export interface ApiResponseError {
  ok: false;
  error_code: number;
  description: string;
  parameters?: {
    retry_after?: number;
    migrate_to_chat_id?: number;
  };
}

export type ApiResponse<T> = ApiResponseOk<T> | ApiResponseError;

export type { Chat, CallbackQuery, Message, User };
