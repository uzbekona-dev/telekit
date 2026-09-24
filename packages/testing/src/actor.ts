import {
  isUploadableFile,
  type Chat,
  type InlineQuery,
  type Location,
  type Update,
  type UploadableFile,
  type User,
} from "@telekit/core";
import { ConversationHarness, type ConversationHarnessOptions } from "./conversation.js";
import { readUpload } from "./fixtures.js";
import type { TestResult } from "./result.js";
import type { DispatchOutcome, RoutingProbe, TestRuntime } from "./runtime.js";
import {
  privateChatFor,
  type ChatMemberUpdateInput,
  type ContactInput,
  type DocumentInput,
  type PhotoInput,
  type UpdateScope,
} from "./updates.js";

/** Extra fields for `photo(InputFile, options)` — `file_id`/`file_size` come from the uploaded fixture. */
export type PhotoOptions = Omit<PhotoInput, "file_id" | "file_size">;
/** Extra fields for `document(InputFile, options)` — `file_name`/`mime_type` default to the fixture's. */
export type DocumentOptions = Omit<DocumentInput, "file_id" | "file_size">;

/** Sends synthetic updates as one user in one chat (spec §28.3 "Kirish"). */
export class TestActor {
  constructor(
    protected readonly runtime: TestRuntime,
    readonly user: User,
    private readonly explicitChat?: Chat,
  ) {}

  get chat(): Chat {
    return this.explicitChat ?? privateChatFor(this.user);
  }

  get scope(): UpdateScope {
    return { user: this.user, chat: this.chat };
  }

  /** Same bot, different sender — `bot.as({ id: 2, first_name: "Boshqa" }).message("...")`. */
  as(user: Partial<User> & { id: number }): TestActor {
    return new TestActor(this.runtime, { is_bot: false, first_name: `User ${user.id}`, ...user }, this.explicitChat);
  }

  /** Same sender, different chat — `bot.inChat({ id: -100123, type: "supergroup" }).message("...")`. */
  inChat(chat: Chat): TestActor {
    return new TestActor(this.runtime, this.user, chat);
  }

  command(name: string, options: { args?: string } = {}): Promise<TestResult> {
    return this.send(this.runtime.updates.command(this.scope, name, options.args));
  }

  message(text: string): Promise<TestResult> {
    return this.send(this.runtime.updates.text(this.scope, text));
  }

  /** `bot.photo(InputFile.path("fixtures/a.jpg"))` uploads the fixture, so `ctx.download()` returns its real bytes (spec §28.3); a plain object describes the photo directly. */
  async photo(input?: PhotoInput | UploadableFile, options: PhotoOptions = {}): Promise<TestResult> {
    if (!isUploadableFile(input)) return this.send(this.runtime.updates.photo(this.scope, input));

    const upload = await readUpload(input);
    const fileId = this.register("photo", upload.bytes);
    return this.send(this.runtime.updates.photo(this.scope, { ...options, file_id: fileId, file_size: upload.bytes.byteLength }));
  }

  /** Like `photo()`: an `InputFile` is uploaded (its name and — for common extensions — MIME type fill `file_name`/`mime_type`). */
  async document(input?: DocumentInput | UploadableFile, options: DocumentOptions = {}): Promise<TestResult> {
    if (!isUploadableFile(input)) return this.send(this.runtime.updates.document(this.scope, input));

    const upload = await readUpload(input);
    const fileId = this.register("document", upload.bytes);
    return this.send(
      this.runtime.updates.document(this.scope, {
        file_name: upload.filename,
        mime_type: upload.mimeType,
        ...options,
        file_id: fileId,
        file_size: upload.bytes.byteLength,
      }),
    );
  }

  contact(input: ContactInput): Promise<TestResult> {
    return this.send(this.runtime.updates.contact(this.scope, input));
  }

  location(location: Location): Promise<TestResult> {
    return this.send(this.runtime.updates.location(this.scope, location));
  }

  /** Typed: `encode` is a `defineCallback` handle, so its payload is schema-checked at compile time — `bot.callback(deleteUser, { userId: 12 })`. */
  callback<P>(encode: (payload: P) => string, payload: P, options: { messageId?: number } = {}): Promise<TestResult> {
    return this.callbackRaw(encode(payload), options);
  }

  /** Presses a button carrying raw `callback_data`. The query points at the bot's last message in this chat unless `messageId` is given. */
  callbackRaw(data: string, options: { messageId?: number } = {}): Promise<TestResult> {
    const messageId = options.messageId ?? this.runtime.fake.lastMessageId(this.chat.id);
    return this.send(this.runtime.updates.callback(this.scope, data, messageId));
  }

  /** `@yourbot <query>` typed by this actor; `offset` is what Telegram sends when the user scrolls to the next page. */
  inlineQuery(query: string, options: { offset?: string; chatType?: InlineQuery["chat_type"] } = {}): Promise<TestResult> {
    return this.send(this.runtime.updates.inlineQuery(this.scope, query, options.offset, options.chatType));
  }

  /** The user picked inline result `resultId` (needs inline feedback in @BotFather in production). */
  chosenInlineResult(resultId: string, options: { query?: string; inlineMessageId?: string } = {}): Promise<TestResult> {
    return this.send(this.runtime.updates.chosenInlineResult(this.scope, resultId, options.query ?? "", options.inlineMessageId));
  }

  chatMember(input: ChatMemberUpdateInput): Promise<TestResult> {
    return this.send(this.runtime.updates.chatMember(this.scope, input));
  }

  /** Drives a `defineConversation` dialog step by step (spec §25.4) — entered lazily on the first harness call. */
  conversation(name: string, options?: ConversationHarnessOptions): ConversationHarness {
    return new ConversationHarness(this, name, options);
  }

  /** Escape hatch for update kinds without a helper; `update_id` is filled in. */
  async send(update: Update | Omit<Update, "update_id">): Promise<TestResult> {
    const full = "update_id" in update ? update : this.runtime.updates.raw(update);
    return (await this.runtime.dispatch(full)).result;
  }

  /** Low-level: sends `text` as this actor, running `probe` in place of routing (after every middleware). Backs the conversation harness. */
  runProbe(text: string, probe: RoutingProbe): Promise<DispatchOutcome> {
    return this.runtime.dispatch(this.runtime.updates.text(this.scope, text), probe);
  }

  private register(kind: string, bytes: Uint8Array): string {
    const fileId = this.runtime.updates.fileId(kind);
    this.runtime.fake.registerFile(fileId, bytes);
    return fileId;
  }
}
