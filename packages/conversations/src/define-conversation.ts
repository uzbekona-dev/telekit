import type { Context, TelegramApi } from "@telekit/core";
import { ConversationSideEffectError } from "./errors.js";
import type { FlowController } from "./flow.js";

export interface ConversationOptions {
  cancelCommands?: string[];
  /** Duration string (e.g. `"30m"`) — an inactive conversation is force-finished after this long. */
  timeout?: string;
  onTimeout?: (flow: FlowController) => void | Promise<void>;
  onCancel?: (flow: FlowController) => void | Promise<void>;
}

export type ConversationHandler = (flow: FlowController, ctx: Context) => void | Promise<void>;

export interface ConversationDefinition {
  name: string;
  handle: ConversationHandler;
  options: ConversationOptions;
}

/** Identity helper matching `defineCommand`/`defineCallback` (spec §15.4/§23.1) — registers a replay-driven dialog with `installConversations`. */
export function defineConversation(
  name: string,
  handle: ConversationHandler,
  options: ConversationOptions = {},
): ConversationDefinition {
  return { name, handle, options };
}

const GUARDED_REPLY_METHODS = [
  "reply",
  "editText",
  "deleteMessage",
  "answerCallback",
  "answerInline",
  "replyWithPhoto",
  "replyWithDocument",
  "replyWithVideo",
  "replyWithAudio",
  "replyWithMediaGroup",
  "download",
] as const;

/**
 * A `ctx` clone handed to the conversation body in place of the real one
 * (ADR-004 "Runtime himoyasi"). `reply`/`editText`/`deleteMessage`/
 * `answerCallback`, the media send/download methods (spec §27), and every
 * `api.*` method throw `ConversationSideEffectError` instead of actually
 * calling Telegram — conversation code must route every side effect through
 * `flow` (e.g. `flow.external("send-photo", () => ctx.replyWithPhoto(...))`)
 * so replay can suppress it on replayed turns. This is a plain object
 * substitution, not a global patch, so it only affects code that actually
 * receives this guarded `ctx` (the conversation body, and anything it calls
 * with the same reference).
 */
export function guardContext(ctx: Context): Context {
  const guarded = { ...ctx };
  for (const method of GUARDED_REPLY_METHODS) {
    (guarded as unknown as Record<string, unknown>)[method] = () => {
      throw new ConversationSideEffectError(method);
    };
  }
  guarded.api = new Proxy(ctx.api, {
    get(_target, prop) {
      throw new ConversationSideEffectError(`api.${String(prop)}`);
    },
  }) as TelegramApi;
  return guarded;
}
