import { TelekitError } from "../errors.js";
import { type Clock, RealClock } from "../util/clock.js";

export interface RateLimitOptions {
  enabled: boolean;
  globalPerSecond: number;
  perChatPerSecond: number;
  burst: number;
  queueLimit: number;
}

export class RateLimitQueueFullError extends TelekitError {
  constructor(limit: number) {
    super("TK1210", `Telegram API rate-limit navbati to'ldi (limit: ${limit})`, {
      retryable: true,
      context: { limit },
    });
  }
}

const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  enabled: true,
  globalPerSecond: 30,
  perChatPerSecond: 1,
  burst: 3,
  queueLimit: 1_000,
};

/** Process-local GCRA limiter with bounded waiting and per-chat fairness. */
export class TelegramRateLimiter {
  private globalTat = 0;
  private readonly chatTat = new Map<string, number>();
  private waiting = 0;
  private readonly options: RateLimitOptions;

  constructor(options: Partial<RateLimitOptions> = {}, private readonly clock: Clock = new RealClock()) {
    this.options = { ...DEFAULT_RATE_LIMIT, ...options };
  }

  async acquire(chatId?: string | number, signal?: AbortSignal): Promise<void> {
    if (!this.options.enabled) return;

    const now = this.clock.now();
    const globalInterval = 1_000 / this.options.globalPerSecond;
    const globalAt = this.allowedAt(this.globalTat || now, globalInterval, now);
    let at = globalAt;
    let chatKey: string | undefined;
    let chatInterval = 0;

    if (chatId !== undefined) {
      chatKey = String(chatId);
      chatInterval = 1_000 / this.options.perChatPerSecond;
      at = Math.max(at, this.allowedAt(this.chatTat.get(chatKey) ?? now, chatInterval, now));
    }

    const delay = Math.max(0, Math.ceil(at - now));
    if (delay > 0 && this.waiting >= this.options.queueLimit) throw new RateLimitQueueFullError(this.options.queueLimit);

    this.globalTat = Math.max(at, this.globalTat || now) + globalInterval;
    if (chatKey !== undefined) this.chatTat.set(chatKey, Math.max(at, this.chatTat.get(chatKey) ?? now) + chatInterval);
    if (delay === 0) return;

    this.waiting++;
    try {
      await this.clock.sleep(delay, signal);
    } finally {
      this.waiting--;
      if (this.chatTat.size > 10_000) this.compact(this.clock.now());
    }
  }

  private allowedAt(tat: number, interval: number, now: number): number {
    return Math.max(now, tat - (this.options.burst - 1) * interval);
  }

  private compact(now: number): void {
    for (const [key, tat] of this.chatTat) {
      if (tat <= now) this.chatTat.delete(key);
    }
  }
}
