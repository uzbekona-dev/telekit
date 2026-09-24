import type { Update } from "@telekit/types";
import type { Logger } from "../logger.js";
import { type Clock, RealClock } from "../util/clock.js";
import type { TelegramApi } from "./client.js";

export interface PollerOptions {
  api: TelegramApi;
  timeout?: number;
  limit?: number;
  allowedUpdates?: string[];
  onUpdate: (update: Update) => void | Promise<void>;
  onError?: (error: unknown) => void;
  logger?: Logger;
  /** Time source for the between-failures backoff — defaults to `RealClock`. */
  clock?: Clock;
}

const POLL_FAILURE_BACKOFF_MS = 1000;

/**
 * Long-polling loop over `getUpdates` (spec §14.4). Only one Poller should
 * run against a given bot token at a time — Telegram itself enforces this
 * with a 409 if two `getUpdates` calls overlap; the Application layer is
 * responsible for the advisory lock that prevents a second instance from
 * getting that far (see spec §14.4, "Bitta poller kafolati" — not yet
 * implemented in v0.1, which targets single-instance deployments only).
 */
export class Poller {
  private running = false;
  private offset = 0;
  private loopPromise: Promise<void> = Promise.resolve();
  private abortController = new AbortController();
  private readonly clock: Clock;

  constructor(private readonly options: PollerOptions) {
    this.clock = options.clock ?? new RealClock();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.abortController = new AbortController();
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.abortController.abort();
    await this.loopPromise;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      let updates: Update[];
      try {
        updates = await this.options.api.getUpdates(
          {
            offset: this.offset,
            timeout: this.options.timeout ?? 50,
            limit: this.options.limit ?? 100,
            allowed_updates: this.options.allowedUpdates,
          },
          { signal: this.abortController.signal },
        );
      } catch (err) {
        if (!this.running) return; // stop() aborted the in-flight request — not a real failure
        this.options.onError?.(err);
        await this.clock.sleep(POLL_FAILURE_BACKOFF_MS).catch(() => {});
        continue;
      }

      for (const update of updates) {
        this.offset = update.update_id + 1;
        try {
          await this.options.onUpdate(update);
        } catch (err) {
          this.options.onError?.(err);
        }
      }
    }
  }
}
