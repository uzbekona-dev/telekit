/**
 * Internal control-flow signal. A conversation body is re-run from the top
 * on every relevant update (ADR-004's replay model) — once execution
 * catches up to wherever it stopped last time, the next `flow.*` call that
 * has nothing left to replay and no fresh answer to consume throws this to
 * unwind the (still-running) async function cleanly. The driving middleware
 * catches it and stops — it is never a real error, never reaches `onError`.
 */
export type PauseReason =
  | { type: "waiting" }
  | { type: "exit" }
  | { type: "restart" }
  | { type: "goto"; name: string; params?: unknown };

export class ConversationPause {
  constructor(readonly reason: PauseReason) {}
}

export function isConversationPause(value: unknown): value is ConversationPause {
  return value instanceof ConversationPause;
}
