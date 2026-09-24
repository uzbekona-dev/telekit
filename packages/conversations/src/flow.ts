import { randomUUID } from "node:crypto";
import {
  btn,
  keyboard,
  type Clock,
  type Contact,
  type Context,
  type Document,
  type InlineKeyboardMarkup,
  type Location,
  type PhotoSize,
  type Update,
} from "@telekit/core";
import type { AskOptions, ChoiceOption, ConfirmOptions, MediaAskOptions, ValidateResult } from "./ask-options.js";
import { resolveMediaAskOptions } from "./ask-options.js";
import { LogCursor, type ConversationLog, type LogEntry } from "./log.js";
import { ConversationPause, type PauseReason } from "./pause.js";
import { ConversationReplayMismatchError } from "./errors.js";

const CHOICE_PREFIX = "__flow_choice__:";
const SKIP_DATA = "__flow_skip__";

/** The prompt plus a trailing "skip" row — built fresh, so a caller's keyboard builder is never mutated. */
function withSkipButton(prompt: PromptMessage, skipLabel: string): PromptMessage {
  const rows = prompt.replyMarkup?.inline_keyboard ?? [];
  return { ...prompt, replyMarkup: { inline_keyboard: [...rows, [{ text: skipLabel, callback_data: SKIP_DATA }]] } };
}

interface PromptMessage {
  text: string;
  replyMarkup?: InlineKeyboardMarkup;
}

export interface FlowControllerOptions {
  name: string;
  /** Immutable value supplied when the conversation was entered. */
  params?: unknown;
  log: ConversationLog;
  /** `undefined` on the turn that *starts* the conversation — that update triggered `ctx.enter()`, it isn't an answer to anything. */
  incomingUpdate: Update | undefined;
  /** The framework's real `ctx` — `flow.reply/edit/delete` call through to it once live; never exposed to the conversation body directly (that's what the guard in `define-conversation.ts` is for). */
  ctx: Context;
  pendingAttempts: number;
  defaultInvalidMessage: string;
  /** Skips replay entirely — every `flow.*` call behaves as if already live. Used for `onTimeout`/`onCancel`, which run once, outside the normal turn-driving loop. */
  forceLive?: boolean;
  /** Source for `flow.now()` — defaults to `Date.now()`; `installConversations` passes its own `clock` option through. */
  clock?: Clock;
}

/** What one turn of driving a conversation body produced. */
export interface FlowRunResult {
  newEntries: LogEntry[];
  pendingAttempts: number;
}

function isValidResult(result: ValidateResult): boolean {
  return result === true;
}

/**
 * Drives one turn of a `defineConversation` body (ADR-004). Replays already-
 * logged `flow.*` calls without side effects, then — once it catches up to
 * where the log ends — either consumes the turn's incoming update as the
 * answer to the next pending ask, or pauses (throws `ConversationPause`) to
 * send a prompt and wait for the next one.
 */
export class FlowController {
  /** Value passed to `ctx.enter(name, params)` or `flow.goto(name, params)`. */
  readonly params: unknown;
  private readonly cursor: LogCursor;
  private readonly newEntries: LogEntry[] = [];
  private consumedIncoming = false;
  private skipLabelForNextAsk?: string;
  private live = false;
  private pendingAttempts: number;
  private nextIndexCounter: number;

  constructor(private readonly options: FlowControllerOptions) {
    this.params = options.params;
    this.cursor = new LogCursor(options.log);
    this.pendingAttempts = options.pendingAttempts;
    this.nextIndexCounter = options.log.entries.length;
    // onTimeout/onCancel (spec ADR-004) run outside the replay loop entirely —
    // they get a `flow` whose reply()/edit()/delete() always send for real.
    // The turn that *starts* a conversation (no answer to consume, nothing
    // logged) has nothing to replay either: output before its first ask — a
    // greeting, say — must go out now, and only now (later turns replay it).
    const isFreshStart = options.incomingUpdate === undefined && options.log.entries.length === 0;
    if (options.forceLive || isFreshStart) this.live = true;
  }

  getResult(): FlowRunResult {
    return { newEntries: this.newEntries, pendingAttempts: this.pendingAttempts };
  }

  // ── internal plumbing ────────────────────────────────────────────

  private nextIndex(): number {
    return this.nextIndexCounter++;
  }

  private goLive(): void {
    this.live = true;
  }

  private pause(reason: PauseReason): never {
    throw new ConversationPause(reason);
  }

  /** Replays `kind` from the log if there's anything left, else calls `compute()` (marking the run live) and appends the result. Used by every nondeterminism-capturing method. */
  private async step<E extends LogEntry>(match: (e: LogEntry) => e is E, label: string, compute: () => Promise<E>): Promise<E> {
    if (!this.cursor.isAtEnd) {
      const entry = this.cursor.consume();
      if (!match(entry)) {
        throw new ConversationReplayMismatchError(this.options.name, `kutilgan ${label}, log'da "${entry.k}" bor edi`);
      }
      return entry;
    }
    this.goLive();
    const entry = await compute();
    this.newEntries.push(entry);
    return entry;
  }

  private stepSync<E extends LogEntry>(match: (e: LogEntry) => e is E, label: string, compute: () => E): E {
    if (!this.cursor.isAtEnd) {
      const entry = this.cursor.consume();
      if (!match(entry)) {
        throw new ConversationReplayMismatchError(this.options.name, `kutilgan ${label}, log'da "${entry.k}" bor edi`);
      }
      return entry;
    }
    this.goLive();
    const entry = compute();
    this.newEntries.push(entry);
    return entry;
  }

  private async sendPrompt(message: PromptMessage): Promise<void> {
    if (!this.live) return; // pure replay — never re-send a prompt already sent on a prior turn
    await this.options.ctx.reply(message.text, message.replyMarkup ? { reply_markup: message.replyMarkup } : undefined);
  }

  // ── ask machinery ────────────────────────────────────────────────

  private async ask<T>(config: {
    prompt?: PromptMessage;
    extract: (update: Update) => T | undefined;
    options?: AskOptions<T>;
    /** Called instead of the default "resend invalidMessage" reply when `validate` returned a string — kept off `AskOptions` itself so only media asks (spec §27.4) pay for it. Never fires for a plain missing-input rejection (no string reason to hand it). */
    onInvalid?: (ctx: Context, message: string) => void | Promise<void>;
  }): Promise<T> {
    // Set by optional() for exactly this ask — cleared before anything can pause.
    const skipLabel = this.skipLabelForNextAsk;
    this.skipLabelForNextAsk = undefined;

    if (!this.cursor.isAtEnd) {
      const entry = this.cursor.consume();
      if (entry.k !== "ask") {
        throw new ConversationReplayMismatchError(this.options.name, `kutilgan "ask", log'da "${entry.k}" bor edi`);
      }
      return entry.value as T;
    }

    this.goLive();

    const canConsume = this.options.incomingUpdate !== undefined && !this.consumedIncoming;
    if (!canConsume) {
      if (config.prompt) await this.sendPrompt(skipLabel === undefined ? config.prompt : withSkipButton(config.prompt, skipLabel));
      this.pause({ type: "waiting" });
    }
    this.consumedIncoming = true;

    if (skipLabel !== undefined && this.options.incomingUpdate?.callback_query?.data === SKIP_DATA) {
      this.pendingAttempts = 0;
      this.newEntries.push({ k: "ask", i: this.nextIndex(), value: null });
      return null as T;
    }

    const raw = config.extract(this.options.incomingUpdate!);
    if (raw === undefined) {
      await this.rejectAndPause(config);
    }

    const validate = config.options?.validate;
    const result = validate ? validate(raw as T) : true;
    if (!isValidResult(result)) {
      await this.rejectAndPause(config, typeof result === "string" ? result : undefined);
    }

    this.pendingAttempts = 0;
    this.newEntries.push({ k: "ask", i: this.nextIndex(), value: raw });
    return raw as T;
  }

  private async rejectAndPause<T>(
    config: {
      prompt?: PromptMessage;
      options?: AskOptions<T>;
      onInvalid?: (ctx: Context, message: string) => void | Promise<void>;
    },
    validatorMessage?: string,
  ): Promise<never> {
    this.pendingAttempts++;
    const retry = config.options?.retry;
    if (retry !== undefined && this.pendingAttempts > retry) {
      this.pendingAttempts = 0;
      this.pause({ type: "exit" });
    }
    if (this.live) {
      if (config.onInvalid && validatorMessage !== undefined) {
        await config.onInvalid(this.options.ctx, validatorMessage);
      } else {
        const text = validatorMessage ?? config.options?.invalidMessage ?? this.options.defaultInvalidMessage;
        await this.options.ctx.reply(text);
      }
    }
    this.pause({ type: "waiting" });
  }

  text(prompt?: string, options?: AskOptions<string>): Promise<string> {
    return this.ask({
      prompt: prompt ? { text: prompt } : undefined,
      extract: (u) => u.message?.text,
      options,
    });
  }

  number(prompt?: string, options?: AskOptions<number> & { min?: number; max?: number }): Promise<number> {
    return this.ask({
      prompt: prompt ? { text: prompt } : undefined,
      extract: (u) => {
        const text = u.message?.text;
        if (text === undefined) return undefined;
        const n = Number(text);
        return Number.isFinite(n) ? n : undefined;
      },
      options: {
        ...options,
        validate: (n) => {
          if (options?.min !== undefined && n < options.min) return false;
          if (options?.max !== undefined && n > options.max) return false;
          return options?.validate ? options.validate(n) : true;
        },
      },
    });
  }

  contact(prompt?: string, options?: AskOptions<Contact>): Promise<Contact> {
    return this.ask({
      prompt: prompt ? { text: prompt } : undefined,
      extract: (u) => u.message?.contact,
      options,
    });
  }

  location(prompt?: string, options?: AskOptions<Location>): Promise<Location> {
    return this.ask({
      prompt: prompt ? { text: prompt } : undefined,
      extract: (u) => u.message?.location,
      options,
    });
  }

  photo(prompt?: string, options?: MediaAskOptions<PhotoSize[]>): Promise<PhotoSize[]> {
    const resolved = resolveMediaAskOptions(options, (sizes) => sizes.at(-1));
    return this.ask({
      prompt: prompt ? { text: prompt } : undefined,
      extract: (u) => (u.message?.photo && u.message.photo.length > 0 ? u.message.photo : undefined),
      options: resolved.options,
      onInvalid: resolved.onInvalid,
    });
  }

  document(prompt?: string, options?: MediaAskOptions<Document>): Promise<Document> {
    const resolved = resolveMediaAskOptions(options, (doc) => doc);
    return this.ask({
      prompt: prompt ? { text: prompt } : undefined,
      extract: (u) => u.message?.document,
      options: resolved.options,
      onInvalid: resolved.onInvalid,
    });
  }

  choice<T>(prompt: string, options: ChoiceOption<T>[]): Promise<T> {
    const replyMarkup = options.reduce(
      (kb, opt, index) => kb.row(btn.callback(opt.label, `${CHOICE_PREFIX}${index}`)),
      keyboard(),
    );

    return this.ask<T>({
      prompt: { text: prompt, replyMarkup },
      extract: (u) => {
        const data = u.callback_query?.data;
        if (data?.startsWith(CHOICE_PREFIX)) {
          const index = Number(data.slice(CHOICE_PREFIX.length));
          return options[index]?.value;
        }
        const text = u.message?.text;
        const byLabel = options.find((o) => o.label === text);
        return byLabel?.value;
      },
    });
  }

  async confirm(prompt: string, options?: ConfirmOptions): Promise<boolean> {
    return this.choice(prompt, [
      { value: true, label: options?.yesLabel ?? "✅ Ha" },
      { value: false, label: options?.noLabel ?? "❌ Yo'q" },
    ]);
  }

  /**
   * Makes the single ask inside `ask` skippable: its prompt gets a
   * `skipLabel` button, and tapping it resolves `null` instead of an answer
   * (validation doesn't run for a skip). Replay-safe like any other ask —
   * the skip is logged as the answer.
   *
   * ```ts
   * const comment = await flow.optional("⏭ O'tkazib yuborish", () => flow.text("Izohingiz?"));
   * ```
   */
  async optional<T>(skipLabel: string, ask: () => Promise<T>): Promise<T | null> {
    this.skipLabelForNextAsk = skipLabel;
    try {
      return await ask();
    } finally {
      this.skipLabelForNextAsk = undefined;
    }
  }

  wait(filter?: (update: Update) => boolean): Promise<Update> {
    return this.ask({
      extract: (u) => (filter ? (filter(u) ? u : undefined) : u),
    });
  }

  // ── output (no-op during replay) ─────────────────────────────────

  async reply(text: string, options?: Parameters<Context["reply"]>[1]): Promise<void> {
    if (!this.live) return;
    await this.options.ctx.reply(text, options);
  }

  async edit(text: string, options?: Parameters<Context["editText"]>[1]): Promise<void> {
    if (!this.live) return;
    await this.options.ctx.editText(text, options);
  }

  async delete(messageId?: number): Promise<void> {
    if (!this.live) return;
    await this.options.ctx.deleteMessage(messageId);
  }

  // ── nondeterminism capture ───────────────────────────────────────

  async external<T>(id: string, fn: () => T | Promise<T>): Promise<T> {
    const entry = await this.step(
      (e): e is Extract<LogEntry, { k: "ext" }> => e.k === "ext" && e.id === id,
      `"ext" (id="${id}")`,
      async () => ({ k: "ext", i: this.nextIndex(), id, value: await fn() }),
    );
    return entry.value as T;
  }

  readonly random = {
    int: (min: number, max: number): number => {
      const entry = this.stepSync(
        (e): e is Extract<LogEntry, { k: "rnd" }> => e.k === "rnd",
        `"rnd"`,
        () => ({ k: "rnd", i: this.nextIndex(), value: Math.floor(Math.random() * (max - min + 1)) + min }),
      );
      return entry.value;
    },
    float: (): number => {
      const entry = this.stepSync(
        (e): e is Extract<LogEntry, { k: "rnd" }> => e.k === "rnd",
        `"rnd"`,
        () => ({ k: "rnd", i: this.nextIndex(), value: Math.random() }),
      );
      return entry.value;
    },
  };

  now(): number {
    const entry = this.stepSync(
      (e): e is Extract<LogEntry, { k: "now" }> => e.k === "now",
      `"now"`,
      () => ({ k: "now", i: this.nextIndex(), value: this.options.clock?.now() ?? Date.now() }),
    );
    return entry.value;
  }

  uuid(): string {
    const entry = this.stepSync(
      (e): e is Extract<LogEntry, { k: "uid" }> => e.k === "uid",
      `"uid"`,
      () => ({ k: "uid", i: this.nextIndex(), value: randomUUID() }),
    );
    return entry.value;
  }

  // ── control ───────────────────────────────────────────────────────

  /**
   * A named savepoint (ADR-004). Memoizes `state` the same way `external`
   * does — replaying skips straight to the stored value without recomputing.
   * Unlike the spec's full description, this does not yet compact/truncate
   * the log to shrink replay cost for steps before the checkpoint (that
   * needs child-log scoping, deferred past this first version) — it is
   * "won't recompute", not yet "won't replay".
   */
  async checkpoint<T>(id: string, state: T | (() => T | Promise<T>)): Promise<T> {
    const entry = await this.step(
      (e): e is Extract<LogEntry, { k: "cp" }> => e.k === "cp" && e.id === id,
      `"cp" (id="${id}")`,
      async () => ({ k: "cp", i: this.nextIndex(), id, state: typeof state === "function" ? await (state as () => T | Promise<T>)() : state }),
    );
    return entry.state as T;
  }

  exit(): never {
    this.pause({ type: "exit" });
  }

  restart(): never {
    this.pause({ type: "restart" });
  }

  goto(name: string, params?: unknown): never {
    this.pause({ type: "goto", name, params });
  }
}
