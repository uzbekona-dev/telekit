import { TelekitError } from "@telekit/core";

/** Thrown when code inside a conversation body calls `ctx.reply()`/`ctx.api.*` directly instead of going through `flow` (ADR-004 "Determinizm rejimi"). */
export class ConversationSideEffectError extends TelekitError {
  constructor(method: string) {
    super(
      "TK2201",
      `Conversation ichida "ctx.${method}()" to'g'ridan-to'g'ri chaqirildi — buning o'rniga "flow.reply()"/"flow.edit()"/"flow.delete()" ishlating`,
    );
  }
}

/** `ctx.enter("name")` / `flow.goto("name")` referenced a name nothing registered via `defineConversation`. */
export class ConversationNotFoundError extends TelekitError {
  constructor(name: string) {
    super("TK2202", `"${name}" nomli conversation ro'yxatdan o'tmagan`);
  }
}

/** `conversations.maxSteps` exceeded (ADR-004 "O(n²) muammosi va checkpoint"). */
export class ConversationTooLongError extends TelekitError {
  constructor(name: string, maxSteps: number) {
    super("TK2203", `"${name}" conversation'i ${maxSteps} qadamdan oshdi (conversations.maxSteps)`);
  }
}

/** The conversation's `timeout` elapsed with no activity. */
export class ConversationTimeoutError extends TelekitError {
  constructor(name: string) {
    super("TK2204", `"${name}" conversation'i muddati tugagach yakunlandi`);
  }
}

/** Replayed log entries no longer match what the (edited) conversation code produces — the code changed under a live conversation. */
export class ConversationReplayMismatchError extends TelekitError {
  constructor(name: string, detail: string) {
    super("TK2205", `"${name}" conversation replay'da nomuvofiqlik: ${detail} — kod o'zgargan bo'lishi mumkin`);
  }
}

/** A `defineFlow` spec is inconsistent — an unknown step, a missing action, a branch with no target, a loop that never asks. */
export class FlowDefinitionError extends TelekitError {
  constructor(name: string, detail: string) {
    super("TK2206", `defineFlow("${name}"): ${detail}`);
  }
}
