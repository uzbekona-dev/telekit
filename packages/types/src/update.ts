import type {
  CallbackQuery,
  ChatJoinRequest,
  ChatMemberUpdated,
  ChosenInlineResult,
  InlineQuery,
  Message,
  Poll,
  PollAnswer,
} from "./objects.js";

export interface Update {
  update_id: number;
  message?: Message;
  edited_message?: Message;
  channel_post?: Message;
  edited_channel_post?: Message;
  callback_query?: CallbackQuery;
  inline_query?: InlineQuery;
  chosen_inline_result?: ChosenInlineResult;
  chat_member?: ChatMemberUpdated;
  my_chat_member?: ChatMemberUpdated;
  chat_join_request?: ChatJoinRequest;
  poll?: Poll;
  poll_answer?: PollAnswer;
}

/**
 * Event type strings routed by @telekit/core's Router.
 * "message:*" variants narrow on the media field present on the message.
 */
export type EventType =
  | "message:text"
  | "message:photo"
  | "message:video"
  | "message:audio"
  | "message:voice"
  | "message:document"
  | "message:animation"
  | "message:sticker"
  | "message:contact"
  | "message:location"
  | "message:poll"
  | "message:any"
  | "edited_message"
  | "channel_post"
  | "edited_channel_post"
  | "callback_query"
  | "inline_query"
  | "chosen_inline_result"
  | "chat_member"
  | "my_chat_member"
  | "chat_join_request"
  | "poll"
  | "poll_answer";

const MESSAGE_MEDIA_EVENT_TYPES: ReadonlyArray<[EventType, keyof Message]> = [
  ["message:photo", "photo"],
  ["message:video", "video"],
  ["message:audio", "audio"],
  ["message:voice", "voice"],
  ["message:document", "document"],
  ["message:animation", "animation"],
  ["message:sticker", "sticker"],
  ["message:contact", "contact"],
  ["message:location", "location"],
  ["message:poll", "poll"],
];

/**
 * Resolves every EventType string that applies to a given update, most
 * specific first. Router tries each in order until a handler matches.
 */
export function resolveEventTypes(update: Update): EventType[] {
  const types: EventType[] = [];

  if (update.message) {
    if (update.message.text !== undefined) types.push("message:text");
    for (const [type, field] of MESSAGE_MEDIA_EVENT_TYPES) {
      if (update.message[field] !== undefined) types.push(type);
    }
    types.push("message:any");
  }
  if (update.edited_message) types.push("edited_message");
  if (update.channel_post) types.push("channel_post");
  if (update.edited_channel_post) types.push("edited_channel_post");
  if (update.callback_query) types.push("callback_query");
  if (update.inline_query) types.push("inline_query");
  if (update.chosen_inline_result) types.push("chosen_inline_result");
  if (update.chat_member) types.push("chat_member");
  if (update.my_chat_member) types.push("my_chat_member");
  if (update.chat_join_request) types.push("chat_join_request");
  if (update.poll) types.push("poll");
  if (update.poll_answer) types.push("poll_answer");

  return types;
}
