/**
 * Ensures updates from the same chat run one at a time, in arrival order,
 * while different chats run fully in parallel (spec §14.3, §69 of the
 * original vision doc). Updates with no resolvable chat id (rare — e.g. an
 * inline_query) run immediately with no ordering constraint.
 */
export class ChatSequencer {
  private readonly chains = new Map<number, Promise<void>>();

  run(chatId: number | undefined, task: () => Promise<void>): Promise<void> {
    if (chatId === undefined) return task();

    const previous = this.chains.get(chatId) ?? Promise.resolve();
    // Chain onto the previous link regardless of whether it resolved or
    // rejected — one handler's error must never block the next update.
    const settled = previous.then(task, task);

    // Store the swallowed variant so a chat that goes quiet right after a
    // failed handler doesn't leave a rejected promise dangling in the map
    // (which would surface as an unhandledRejection). Callers still get the
    // real error through the `settled` promise returned below.
    const chained = settled.catch(() => {});
    this.chains.set(chatId, chained);
    void chained.finally(() => {
      if (this.chains.get(chatId) === chained) this.chains.delete(chatId);
    });

    return settled;
  }

  /** Number of chats with an in-flight or queued chain. Exposed for tests/metrics. */
  get activeChatCount(): number {
    return this.chains.size;
  }
}
