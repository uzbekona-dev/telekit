import { sleep } from "./duration.js";

/**
 * Time source for anything that waits (retry backoff, poll failure backoff).
 * `RealClock` is the production default; `VirtualClock` lets tests advance
 * time synchronously instead of waiting out real delays (spec §28.4,
 * `bot.clock.advance("5m")`).
 */
export interface Clock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export class RealClock implements Clock {
  now(): number {
    return Date.now();
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return sleep(ms, signal);
  }
}

interface PendingSleep {
  at: number;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

/**
 * Manual virtual clock: `sleep()` never touches a real timer — it parks the
 * caller until `advance()` moves virtual time past the requested deadline.
 * Each instance is independent, so parallel tests using separate bots never
 * bleed fake time into one another (unlike a process-global fake timer).
 */
export class VirtualClock implements Clock {
  private virtualNow: number;
  private pending: PendingSleep[] = [];

  /** `start` is the initial virtual epoch-ms — `0` by default; `@telekit/testing` starts at the real "now" so virtual timestamps stay realistic. */
  constructor(start = 0) {
    this.virtualNow = start;
  }

  now(): number {
    return this.virtualNow;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new Error("aborted"));
        return;
      }

      const entry: PendingSleep = { at: this.virtualNow + ms, resolve, reject };
      this.pending.push(entry);

      signal?.addEventListener(
        "abort",
        () => {
          this.pending = this.pending.filter((p) => p !== entry);
          reject(signal.reason ?? new Error("aborted"));
        },
        { once: true },
      );
    });
  }

  /**
   * Advances virtual time up to `virtualNow + ms`, resolving due sleeps one
   * deadline at a time (not all at once) so a sleep's continuation that
   * schedules another sleep — a retry loop's next attempt — sees the correct
   * intermediate virtual time and gets its own deadline evaluated against
   * the remaining budget, instead of every chained wait collapsing onto the
   * same instant.
   *
   * Before each check we flush the microtask queue, not just one tick of it:
   * the code racing to call `sleep()` is usually itself behind a chain of
   * unresolved promises (a mocked `fetch`, `response.json()`, ...), and all
   * of that settles at zero virtual-time cost — same as how a real
   * `setTimeout` registered inside a `.then()` still lands before Node's
   * timer phase runs, because the microtask queue always drains first.
   */
  async advance(ms: number): Promise<void> {
    const target = this.virtualNow + ms;

    await flushMicrotasks();
    let nextDeadline = this.nextDeadlineWithin(target);
    while (nextDeadline !== null) {
      // max(): a concurrent advance() may already have moved time further — never rewind it.
      this.virtualNow = Math.max(this.virtualNow, nextDeadline);
      const due = this.pending.filter((p) => p.at <= this.virtualNow);
      this.pending = this.pending.filter((p) => p.at > this.virtualNow);
      for (const entry of due) entry.resolve();
      await flushMicrotasks();
      nextDeadline = this.nextDeadlineWithin(target);
    }

    this.virtualNow = Math.max(this.virtualNow, target);
  }

  /** Earliest parked `sleep()` deadline, or `null` if nothing is waiting — lets `@telekit/testing` fast-forward retry backoff without the test hand-picking a duration. */
  nextDeadline(): number | null {
    return this.pending.length === 0 ? null : Math.min(...this.pending.map((p) => p.at));
  }

  private nextDeadlineWithin(target: number): number | null {
    const deadlines = this.pending.filter((p) => p.at <= target).map((p) => p.at);
    return deadlines.length === 0 ? null : Math.min(...deadlines);
  }
}

/** Yields until the microtask queue is fully drained — `setImmediate` only fires after Node processes every pending promise continuation, unlike `await Promise.resolve()` which only advances one tick at a time. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
