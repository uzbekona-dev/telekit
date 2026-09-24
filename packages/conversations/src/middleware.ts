import { randomUUID } from "node:crypto";
import { parseDuration, RealClock, type Clock, type Context, type Middleware } from "@telekit/core";
import { guardContext, type ConversationDefinition } from "./define-conversation.js";
import { ConversationConflictError, ConversationNotFoundError, ConversationTooLongError } from "./errors.js";
import { FlowController } from "./flow.js";
import { emptyLog, type ConversationLog } from "./log.js";
import { isConversationPause } from "./pause.js";
import type { ConversationPatch, ConversationRecord, ConversationStatus, ConversationStore } from "./store.js";

export type ConversationKeyStrategy = "user-chat" | "chat";
export type ConversationConflictPolicy = "replace" | "reject";

export interface InstallConversationsOptions {
  store: ConversationStore;
  /** "user-chat" (default) scopes a conversation per (chat, user); "chat" shares one across everyone in the chat. */
  key?: ConversationKeyStrategy;
  maxSteps?: number;
  defaultInvalidMessage?: string;
  onConflict?: ConversationConflictPolicy;
  /** Time source for `timeout` expiry and `flow.now()` — defaults to `RealClock`. Tests pass `@telekit/testing`'s `bot.clock` so `bot.clock.advance("30m")` expires a conversation without waiting. */
  clock?: Clock;
}

/** What a conversation did with the current update — see `ctx.conversation`. */
export interface ConversationTurnState {
  /** The conversation that handled the update — after `flow.goto()`, the one it switched to. */
  name: string;
  /** `"active"` while it waits for the next answer; anything else means it ended on this update. */
  status: ConversationStatus;
}

const DEFAULT_MAX_STEPS = 50;
const DEFAULT_INVALID_MESSAGE = "Tushunmadim, qaytadan urinib ko'ring.";

declare module "@telekit/core" {
  interface Context {
    /** Starts a registered conversation for the current chat/user (spec §25.1). Populated by `installConversations`; `undefined` if it isn't installed or a conversation is already active for this key. */
    enter?(name: string, params?: unknown): Promise<void>;
    /** Set by `installConversations` whenever a conversation handled or started on this update — lets later middleware (and `@telekit/testing`'s conversation harness) see the outcome. `undefined` when no conversation was involved. */
    conversation?: ConversationTurnState;
  }
}

function deriveKey(ctx: Context, strategy: ConversationKeyStrategy): string | null {
  if (!ctx.chat) return null;
  if (strategy === "chat") return `chat:${ctx.chat.id}`;
  if (!ctx.from) return null;
  return `user-chat:${ctx.chat.id}:${ctx.from.id}`;
}

function appendedLog(base: ConversationLog, added: ConversationLog["entries"]): ConversationLog {
  return { version: 1, entries: [...base.entries, ...added] };
}

/**
 * Wires `defineConversation` handlers into an `Application` (spec §25).
 * Install once, as global middleware — before routing, so an active
 * conversation intercepts its owner's next update instead of falling
 * through to commands/events:
 *
 * ```ts
 * app.use(installConversations([registerFlow], { store: new DatabaseConversationStore(db) }));
 * ```
 */
export function installConversations(definitions: ConversationDefinition[], options: InstallConversationsOptions): Middleware {
  const byName = new Map(definitions.map((d) => [d.name, d] as const));
  const keyStrategy = options.key ?? "user-chat";
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const invalidMessage = options.defaultInvalidMessage ?? DEFAULT_INVALID_MESSAGE;
  const onConflict = options.onConflict ?? "replace";
  const clock = options.clock ?? new RealClock();

  function resolve(name: string): ConversationDefinition {
    const def = byName.get(name);
    if (!def) throw new ConversationNotFoundError(name);
    return def;
  }

  function expiryFor(def: ConversationDefinition): Date | null {
    return def.options.timeout ? new Date(clock.now() + parseDuration(def.options.timeout)) : null;
  }

  /** Runs `onTimeout`/`onCancel` with a live (non-replaying) flow — best-effort, errors are swallowed so a broken hook can't wedge the conversation in a stuck state. */
  async function runTerminalHook(
    def: ConversationDefinition,
    ctx: Context,
    hook: ((flow: FlowController) => void | Promise<void>) | undefined,
    params?: unknown,
  ): Promise<void> {
    if (!hook) return;
    const flow = new FlowController({
      name: def.name,
      params,
      log: emptyLog(),
      incomingUpdate: undefined,
      ctx, // real ctx — FlowController's own reply()/edit()/delete() must actually send
      pendingAttempts: 0,
      defaultInvalidMessage: invalidMessage,
      forceLive: true,
      clock,
    });
    await Promise.resolve(hook(flow)).catch(() => {});
  }

  /**
   * Drives exactly one turn: replays `record.log`, then either consumes
   * `ctx.update` as the answer to the next pending ask (when `isInitiating`
   * is false) or starts fresh (when true — the update that called
   * `ctx.enter()` isn't itself an answer to anything).
   */
  async function driveTurn(record: ConversationRecord, ctx: Context, key: string, isInitiating: boolean): Promise<void> {
    const def = resolve(record.name);

    /**
     * Persists this turn's outcome and reports it on `ctx.conversation`. On an
     * optimistic-lock conflict (another instance wrote first) the turn is
     * dropped, per the `ConversationStore.update` contract: the caller must not
     * act on it (no hooks, no restart, no goto), and `ctx.conversation` shows
     * whatever is actually persisted instead of what this turn intended.
     */
    async function commit(patch: ConversationPatch, status: ConversationStatus): Promise<boolean> {
      if (await options.store.update(record.id, patch, record.version)) {
        ctx.conversation = { name: def.name, status };
        return true;
      }
      const current = await options.store.findActive(key);
      ctx.conversation = current ? { name: current.name, status: "active" } : undefined;
      return false;
    }

    // `<=` matches `ConversationStore.findExpired()` — a conversation is expired *at* its deadline, not one tick after.
    if (record.expiresAt && record.expiresAt.getTime() <= clock.now()) {
      if (await commit({ status: "timeout" }, "timeout")) await runTerminalHook(def, ctx, def.options.onTimeout, record.params);
      return;
    }

    const text = ctx.message?.text;
    if (!isInitiating && text && def.options.cancelCommands?.includes(text)) {
      if (await commit({ status: "cancelled" }, "cancelled")) await runTerminalHook(def, ctx, def.options.onCancel, record.params);
      return;
    }

    const flow = new FlowController({
      name: def.name,
      params: record.params,
      log: record.log,
      incomingUpdate: isInitiating ? undefined : ctx.update,
      ctx, // real ctx — FlowController's own reply()/edit()/delete() must actually send
      pendingAttempts: record.pendingAttempts,
      defaultInvalidMessage: invalidMessage,
      clock,
    });

    try {
      await def.handle(flow, guardContext(ctx));
      const { newEntries } = flow.getResult();
      await commit({ log: appendedLog(record.log, newEntries), status: "done", pendingAttempts: 0 }, "done");
      return;
    } catch (err) {
      if (!isConversationPause(err)) throw err;

      const { newEntries, pendingAttempts } = flow.getResult();
      const newLog = appendedLog(record.log, newEntries);

      if (newLog.entries.length > maxSteps) {
        await commit({ status: "done" }, "done");
        throw new ConversationTooLongError(def.name, maxSteps);
      }

      if (err.reason.type === "waiting") {
        await commit({ log: newLog, pendingAttempts, expiresAt: expiryFor(def) }, "active");
        return;
      }
      if (err.reason.type === "exit") {
        await commit({ log: newLog, status: "done", pendingAttempts: 0 }, "done");
        return;
      }
      if (err.reason.type === "restart") {
        if (!(await commit({ log: emptyLog(), pendingAttempts: 0, expiresAt: expiryFor(def) }, "active"))) return;
        const reloaded = await options.store.findActive(key);
        if (reloaded) await driveTurn(reloaded, ctx, key, true);
        return;
      }
      // goto: only once the old conversation is really closed — entering the next one after a
      // lost race would leave two "active" rows for the same key. The nested enter() reports it.
      if (!(await commit({ log: newLog, status: "done", pendingAttempts: 0 }, "done"))) return;
      await enter(err.reason.name, ctx, key, err.reason.params);
      return;
    }
  }

  async function enter(name: string, ctx: Context, key: string, params?: unknown): Promise<void> {
    const def = resolve(name);
    let created: ConversationRecord;
    try {
      created = await options.store.create({
        id: randomUUID(),
        key,
        name,
        params,
        chatId: ctx.chat?.id ?? null,
        userId: ctx.from?.id ?? null,
        expiresAt: expiryFor(def),
      });
    } catch (error) {
      if (!(error instanceof ConversationConflictError)) throw error;
      const current = await options.store.findActive(key);
      ctx.conversation = current ? { name: current.name, status: "active" } : undefined;
      return;
    }
    await driveTurn(created, ctx, key, true);
  }

  return async (ctx, next) => {
    const key = deriveKey(ctx, keyStrategy);
    if (!key) {
      await next();
      return;
    }

    const active = await options.store.findActive(key);
    if (active) {
      try {
        await driveTurn(active, ctx, key, false);
      } finally {
        // A tapped inline button (flow.choice/confirm) spins until its callback query is
        // answered — the conversation consumed this update, so nothing else will answer it,
        // and the guarded ctx the body gets can't.
        if (ctx.callback) await ctx.answerCallback().catch(() => {});
      }
      return;
    }

    ctx.enter = async (name: string, params?: unknown) => {
      const stillActive = await options.store.findActive(key);
      if (stillActive) {
        if (onConflict === "reject") {
          ctx.log.warn({ event: "conversation.conflict", key, name }, "Faol conversation bor — yangi kirish rad etildi");
          return;
        }
        const replaced = await options.store.update(stillActive.id, { status: "done" }, stillActive.version);
        if (!replaced) {
          const current = await options.store.findActive(key);
          ctx.conversation = current ? { name: current.name, status: "active" } : undefined;
          return;
        }
      }
      await enter(name, ctx, key, params);
    };

    await next();
  };
}
