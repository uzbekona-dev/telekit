/**
 * Deterministic-replay log (ADR-004 "Log formati"). Every entry is a
 * recorded answer to exactly one `flow.*` call, in call order — replaying a
 * conversation body from the top and feeding each `flow.*` call its logged
 * entry (instead of waiting for a real update) reproduces prior turns
 * exactly, so execution can "resume" past them to wherever it stopped.
 */
export type LogEntry =
  | { k: "ask"; i: number; value: unknown }
  | { k: "ext"; i: number; id: string; value: unknown }
  | { k: "rnd"; i: number; value: number }
  | { k: "now"; i: number; value: number }
  | { k: "uid"; i: number; value: string }
  | { k: "cp"; i: number; id: string; state: unknown };

export interface ConversationLog {
  version: 1;
  entries: LogEntry[];
}

export function emptyLog(): ConversationLog {
  return { version: 1, entries: [] };
}

/**
 * Walks a `ConversationLog` one `flow.*` call at a time. `next()` advances
 * regardless of kind — `flow.text()`, `flow.external()`, `flow.random()`,
 * etc. all share one sequence, exactly mirroring the order they're called
 * in the conversation body (ADR-004's replay requires this: reordering
 * `flow` calls between runs is exactly the nondeterminism the whole design
 * exists to prevent).
 */
export class LogCursor {
  private index = 0;

  constructor(private readonly log: ConversationLog) {}

  get position(): number {
    return this.index;
  }

  get isAtEnd(): boolean {
    return this.index >= this.log.entries.length;
  }

  /** Returns the next entry without consuming it, or `undefined` past the end. */
  peek(): LogEntry | undefined {
    return this.log.entries[this.index];
  }

  /** Consumes and returns the next entry — caller has already checked `peek()`/`isAtEnd`. */
  consume(): LogEntry {
    const entry = this.log.entries[this.index];
    if (!entry) throw new Error("LogCursor.consume() called past the end of the log");
    this.index++;
    return entry;
  }
}
