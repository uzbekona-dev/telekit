/**
 * Hand-written subset of Telegram Bot API object types, covering the
 * surface needed by @telekit/core v0.1 (commands, text/media events,
 * callback queries). Field names stay snake_case, matching the raw
 * Bot API payload — see ADR-002 in the project spec.
 */

export interface User {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: true;
  added_to_attachment_menu?: true;
}

export type ChatType = "private" | "group" | "supergroup" | "channel";

export interface Chat {
  id: number;
  type: ChatType;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_forum?: true;
}

export interface MessageEntity {
  type:
    | "mention"
    | "hashtag"
    | "cashtag"
    | "bot_command"
    | "url"
    | "email"
    | "phone_number"
    | "bold"
    | "italic"
    | "underline"
    | "strikethrough"
    | "spoiler"
    | "code"
    | "pre"
    | "text_link"
    | "text_mention"
    | "custom_emoji";
  offset: number;
  length: number;
  url?: string;
  user?: User;
  language?: string;
  custom_emoji_id?: string;
}

export interface PhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface Document {
  file_id: string;
  file_unique_id: string;
  thumbnail?: PhotoSize;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface Video {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  thumbnail?: PhotoSize;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface Audio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface Voice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface Animation {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  thumbnail?: PhotoSize;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface Sticker {
  file_id: string;
  file_unique_id: string;
  type: "regular" | "mask" | "custom_emoji";
  width: number;
  height: number;
  is_animated: boolean;
  is_video: boolean;
  emoji?: string;
  set_name?: string;
}

export interface Contact {
  phone_number: string;
  first_name: string;
  last_name?: string;
  user_id?: number;
  vcard?: string;
}

export interface Location {
  longitude: number;
  latitude: number;
  horizontal_accuracy?: number;
  live_period?: number;
  heading?: number;
  proximity_alert_radius?: number;
}

export interface Venue {
  location: Location;
  title: string;
  address: string;
  foursquare_id?: string;
  foursquare_type?: string;
}

export interface PollOption {
  text: string;
  voter_count: number;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  total_voter_count: number;
  is_closed: boolean;
  is_anonymous: boolean;
  type: "regular" | "quiz";
  allows_multiple_answers: boolean;
}

export interface Dice {
  emoji: string;
  value: number;
}

/**
 * Message.reply_to_message points to another Message, but never more
 * than one level deep in practice; typed as a recursive interface
 * since TypeScript resolves this fine for object (not type-alias) recursion.
 */
export interface Message {
  message_id: number;
  message_thread_id?: number;
  from?: User;
  date: number;
  chat: Chat;
  reply_to_message?: Message;
  text?: string;
  entities?: MessageEntity[];
  caption?: string;
  caption_entities?: MessageEntity[];
  photo?: PhotoSize[];
  document?: Document;
  video?: Video;
  audio?: Audio;
  voice?: Voice;
  animation?: Animation;
  sticker?: Sticker;
  contact?: Contact;
  location?: Location;
  venue?: Venue;
  poll?: Poll;
  dice?: Dice;
  new_chat_members?: User[];
  left_chat_member?: User;
  pinned_message?: Message;
}

export interface CallbackQuery {
  id: string;
  from: User;
  message?: Message;
  inline_message_id?: string;
  chat_instance: string;
  data?: string;
  game_short_name?: string;
}

export interface InlineQuery {
  id: string;
  from: User;
  query: string;
  offset: string;
  chat_type?: "sender" | ChatType;
  location?: Location;
}

export interface ChosenInlineResult {
  result_id: string;
  from: User;
  location?: Location;
  inline_message_id?: string;
  query: string;
}

export type ChatMemberStatus =
  | "creator"
  | "administrator"
  | "member"
  | "restricted"
  | "left"
  | "kicked";

export interface ChatMember {
  status: ChatMemberStatus;
  user: User;
  is_anonymous?: boolean;
  can_be_edited?: boolean;
  is_member?: boolean;
  until_date?: number;
}

export interface ChatMemberUpdated {
  chat: Chat;
  from: User;
  date: number;
  old_chat_member: ChatMember;
  new_chat_member: ChatMember;
  invite_link?: unknown;
}

export interface ChatJoinRequest {
  chat: Chat;
  from: User;
  user_chat_id: number;
  date: number;
  bio?: string;
  invite_link?: unknown;
}

export interface PollAnswer {
  poll_id: string;
  voter_chat?: Chat;
  user?: User;
  option_ids: number[];
}

// ── Keyboards ──────────────────────────────────────────────

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: { url: string };
  switch_inline_query?: string;
  switch_inline_query_current_chat?: string;
  pay?: boolean;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface KeyboardButton {
  text: string;
  request_contact?: boolean;
  request_location?: boolean;
}

export interface ReplyKeyboardMarkup {
  keyboard: KeyboardButton[][];
  is_persistent?: boolean;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  input_field_placeholder?: string;
  selective?: boolean;
}

export interface ReplyKeyboardRemove {
  remove_keyboard: true;
  selective?: boolean;
}

export interface ForceReply {
  force_reply: true;
  input_field_placeholder?: string;
  selective?: boolean;
}

export type ReplyMarkup =
  | InlineKeyboardMarkup
  | ReplyKeyboardMarkup
  | ReplyKeyboardRemove
  | ForceReply;

export interface BotCommand {
  command: string;
  description: string;
}

// ── Files (getFile) ────────────────────────────────────────

/**
 * Named `TelegramFile` (not `File`) to avoid colliding with the DOM/Node
 * global `File` — this is the Bot API `getFile` result object.
 */
export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

// ── Media groups (sendMediaGroup) ─────────────────────────
//
// `media` is always a wire-level string here: a file_id, an http(s) url, or
// `attach://<name>` referencing a multipart part. Accepting an uploadable
// object directly is a `@telekit/core` media-pipeline concern (spec §27),
// which rewrites those into this shape before calling the API.

export interface InputMediaPhoto {
  type: "photo";
  media: string;
  caption?: string;
  parse_mode?: string;
}

export interface InputMediaVideo {
  type: "video";
  media: string;
  caption?: string;
  parse_mode?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface InputMediaDocument {
  type: "document";
  media: string;
  caption?: string;
  parse_mode?: string;
}

export interface InputMediaAudio {
  type: "audio";
  media: string;
  caption?: string;
  parse_mode?: string;
  duration?: number;
  performer?: string;
  title?: string;
}

export interface InputMediaAnimation {
  type: "animation";
  media: string;
  caption?: string;
  parse_mode?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export type InputMedia =
  | InputMediaPhoto
  | InputMediaVideo
  | InputMediaDocument
  | InputMediaAudio
  | InputMediaAnimation;

// ── Inline mode ────────────────────────────────────────────

export interface InputTextMessageContent {
  message_text: string;
  parse_mode?: string;
  link_preview_options?: { is_disabled?: boolean };
}

export interface InlineQueryResultArticle {
  type: "article";
  id: string;
  title: string;
  input_message_content: InputTextMessageContent;
  description?: string;
  reply_markup?: InlineKeyboardMarkup;
}

export interface InlineQueryResultPhoto {
  type: "photo";
  id: string;
  photo_url: string;
  thumbnail_url: string;
  title?: string;
  description?: string;
  caption?: string;
  parse_mode?: string;
  reply_markup?: InlineKeyboardMarkup;
  input_message_content?: InputTextMessageContent;
}

export interface InlineQueryResultGif {
  type: "gif";
  id: string;
  gif_url: string;
  thumbnail_url: string;
  title?: string;
  caption?: string;
  parse_mode?: string;
  reply_markup?: InlineKeyboardMarkup;
  input_message_content?: InputTextMessageContent;
}

export interface InlineQueryResultVideo {
  type: "video";
  id: string;
  video_url: string;
  mime_type: "text/html" | "video/mp4";
  thumbnail_url: string;
  title: string;
  description?: string;
  caption?: string;
  parse_mode?: string;
  reply_markup?: InlineKeyboardMarkup;
  input_message_content?: InputTextMessageContent;
}

export interface InlineQueryResultDocument {
  type: "document";
  id: string;
  title: string;
  document_url: string;
  mime_type: "application/pdf" | "application/zip";
  description?: string;
  caption?: string;
  parse_mode?: string;
  reply_markup?: InlineKeyboardMarkup;
  input_message_content?: InputTextMessageContent;
}

/** A photo already on Telegram's servers, sent by `file_id` — no upload, no URL fetch. */
export interface InlineQueryResultCachedPhoto {
  type: "photo";
  id: string;
  photo_file_id: string;
  title?: string;
  description?: string;
  caption?: string;
  parse_mode?: string;
  reply_markup?: InlineKeyboardMarkup;
  input_message_content?: InputTextMessageContent;
}

export interface InlineQueryResultCachedDocument {
  type: "document";
  id: string;
  title: string;
  document_file_id: string;
  description?: string;
  caption?: string;
  parse_mode?: string;
  reply_markup?: InlineKeyboardMarkup;
  input_message_content?: InputTextMessageContent;
}

export interface InlineQueryResultCachedSticker {
  type: "sticker";
  id: string;
  sticker_file_id: string;
  reply_markup?: InlineKeyboardMarkup;
  input_message_content?: InputTextMessageContent;
}

export type InlineQueryResult =
  | InlineQueryResultArticle
  | InlineQueryResultPhoto
  | InlineQueryResultGif
  | InlineQueryResultVideo
  | InlineQueryResultDocument
  | InlineQueryResultCachedPhoto
  | InlineQueryResultCachedDocument
  | InlineQueryResultCachedSticker;

/** Shown above inline results; opens the bot's private chat with `/start <start_parameter>` or a Web App (Bot API `InlineQueryResultsButton`). */
export interface InlineQueryResultsButton {
  text: string;
  web_app?: { url: string };
  start_parameter?: string;
}
