import type { AnswerInlineQueryParams, InlineKeyboardButton, KeyboardButton, ReplyMarkup } from "@telekit/core";
import type { ApiCall } from "./fake-telegram.js";

/** A message the bot sent (`send*`) or changed (`editMessage*`) while handling one test update. */
export interface SentMessage {
  method: string;
  chat_id?: number | string;
  /** For `send*`: the id of the message Telegram created; for `editMessage*`: the id of the message that was edited. */
  message_id?: number;
  text?: string;
  caption?: string;
  reply_markup?: ReplyMarkup;
  params: Record<string, unknown>;
}

/** One `ctx.t(key, params)` call made while handling the update — backs `toHaveRepliedWithKey` (spec §28.3). */
export interface TranslationCall {
  key: string;
  params?: Record<string, unknown>;
  text: string;
}

/** What `@telekit/conversations` reported for the update via `ctx.conversation` — `status` is `"active"` while it waits for the next answer. */
export interface ConversationOutcome {
  name: string;
  status: string;
}

/** What one simulated update produced (spec §28.3 "Natija"). */
export interface TestResult {
  replies: SentMessage[];
  edits: SentMessage[];
  deletes: Array<{ chat_id?: number | string; message_id?: number }>;
  apiCalls: ApiCall[];
  answeredCallback?: Record<string, unknown>;
  /** The `answerInlineQuery` call of an inline query update — `results`, `next_offset`, ... */
  inlineAnswer?: AnswerInlineQueryParams;
  translations: TranslationCall[];
  /** Set when the update was handled by (or started) a conversation. */
  conversation?: ConversationOutcome;
  /** The error a handler/middleware threw, if any — `onError` still runs as in production. */
  error?: unknown;
  /** Wall-clock milliseconds the pipeline took. */
  duration: number;
}

function resultMessageId(call: ApiCall): number | undefined {
  const result = call.result as { message_id?: unknown } | undefined;
  return typeof result?.message_id === "number" ? result.message_id : undefined;
}

function toSentMessage(call: ApiCall): SentMessage {
  const { params } = call;
  return {
    method: call.method,
    chat_id: params.chat_id as number | string | undefined,
    message_id: (params.message_id as number | undefined) ?? resultMessageId(call),
    text: typeof params.text === "string" ? params.text : undefined,
    caption: typeof params.caption === "string" ? params.caption : undefined,
    reply_markup: params.reply_markup as ReplyMarkup | undefined,
    params,
  };
}

function isReplyMethod(method: string): boolean {
  return method.startsWith("send") && method !== "sendChatAction";
}

/** Every successful send and edit of one update, in the order the bot made them (unlike `replies`/`edits`, which are split by kind). */
export function messagesInOrder(result: TestResult): SentMessage[] {
  return result.apiCalls
    .filter((c) => c.ok && (isReplyMethod(c.method) || c.method.startsWith("editMessage")))
    .map(toSentMessage);
}

/** The user-visible text of a message — its `text`, else its `caption`. */
export function bodyOf(message: SentMessage): string {
  return message.text ?? message.caption ?? "";
}

/** All buttons of a message's inline or reply keyboard, row by row. */
export function buttonsOf(message: SentMessage): Array<InlineKeyboardButton | KeyboardButton> {
  const markup = message.reply_markup as
    | { inline_keyboard?: InlineKeyboardButton[][]; keyboard?: KeyboardButton[][] }
    | undefined;
  return [...(markup?.inline_keyboard ?? []), ...(markup?.keyboard ?? [])].flat();
}

export function buildResult(input: {
  calls: ApiCall[];
  translations: TranslationCall[];
  conversation?: ConversationOutcome;
  error: unknown;
  duration: number;
}): TestResult {
  const successful = input.calls.filter((c) => c.ok);
  const answer = successful.filter((c) => c.method === "answerCallbackQuery").at(-1);
  const inlineAnswer = successful.filter((c) => c.method === "answerInlineQuery").at(-1);

  return {
    replies: successful.filter((c) => isReplyMethod(c.method)).map(toSentMessage),
    edits: successful.filter((c) => c.method.startsWith("editMessage")).map(toSentMessage),
    deletes: successful
      .filter((c) => c.method === "deleteMessage")
      .map((c) => ({ chat_id: c.params.chat_id as number | string | undefined, message_id: c.params.message_id as number | undefined })),
    apiCalls: input.calls,
    answeredCallback: answer?.params,
    inlineAnswer: inlineAnswer?.params as AnswerInlineQueryParams | undefined,
    translations: input.translations,
    conversation: input.conversation,
    error: input.error,
    duration: input.duration,
  };
}
