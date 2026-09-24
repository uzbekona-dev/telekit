import { TelekitError } from "../errors.js";
import { AsyncResource } from "node:async_hooks";

export class UpdateQueueFullError extends TelekitError {
  constructor(limit: number) {
    super("TK1401", `Update navbati to'ldi (limit: ${limit})`, { retryable: true, context: { limit } });
  }
}

export class UpdateExecutorClosedError extends TelekitError {
  constructor() {
    super("TK1402", "Update qabul qilish to'xtatilgan", { retryable: true });
  }
}

export class ShutdownTimeoutError extends TelekitError {
  constructor(timeoutMs: number, pending: number) {
    super("TK1403", `Graceful shutdown ${timeoutMs}ms ichida tugamadi (${pending} ta update qoldi)`, {
      context: { timeoutMs, pending },
    });
  }
}

interface PendingTask<T = unknown> {
  key: string | number | undefined;
  task: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

/**
 * A key-aware bounded executor: updates from one chat stay ordered while
 * unrelated chats can use the remaining global slots. The bounded queue is
 * shared by polling and webhook ingress, so overload is explicit instead of
 * growing memory without limit.
 */
export class UpdateExecutor {
  private active = 0;
  private readonly activeByKey = new Map<string | number, number>();
  private readonly queue: PendingTask[] = [];
  private accepting = true;
  private readonly drainWaiters = new Set<() => void>();

  constructor(
    private readonly globalLimit: number,
    private readonly perKeyLimit: number,
    private readonly queueLimit: number,
  ) {}

  get pending(): number {
    return this.active + this.queue.length;
  }

  canAccept(): boolean {
    return this.accepting && (this.active < this.globalLimit || this.queue.length < this.queueLimit);
  }

  stopAccepting(): void {
    this.accepting = false;
    this.notifyIfDrained();
  }

  run<T>(key: string | number | undefined, task: () => T | Promise<T>): Promise<T> {
    if (!this.accepting) return Promise.reject(new UpdateExecutorClosedError());
    const taskInCallerContext = AsyncResource.bind(task);

    return new Promise<T>((resolve, reject) => {
      const pending: PendingTask<T> = { key, task: () => Promise.resolve().then(taskInCallerContext), resolve, reject };
      if (this.canStart(key)) {
        this.startTask(pending);
        return;
      }
      if (this.queue.length >= this.queueLimit) {
        reject(new UpdateQueueFullError(this.queueLimit));
        return;
      }
      this.queue.push(pending as PendingTask);
    });
  }

  async drain(timeoutMs: number): Promise<void> {
    if (this.pending === 0) return;

    let timer: NodeJS.Timeout | undefined;
    let resolveDrain!: () => void;
    const drained = new Promise<void>((resolve) => {
      resolveDrain = resolve;
      this.drainWaiters.add(resolve);
    });
    await Promise.race([
      drained,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ShutdownTimeoutError(timeoutMs, this.pending)), timeoutMs);
        timer.unref();
      }),
    ]).finally(() => {
      this.drainWaiters.delete(resolveDrain);
      if (timer) clearTimeout(timer);
    });
  }

  private canStart(key: string | number | undefined): boolean {
    if (this.active >= this.globalLimit) return false;
    return key === undefined || (this.activeByKey.get(key) ?? 0) < this.perKeyLimit;
  }

  private startTask<T>(pending: PendingTask<T>): void {
    this.active++;
    if (pending.key !== undefined) this.activeByKey.set(pending.key, (this.activeByKey.get(pending.key) ?? 0) + 1);

    pending.task().then(pending.resolve, pending.reject).finally(() => {
      this.active--;
      if (pending.key !== undefined) {
        const left = (this.activeByKey.get(pending.key) ?? 1) - 1;
        if (left === 0) this.activeByKey.delete(pending.key);
        else this.activeByKey.set(pending.key, left);
      }
      this.schedule();
      this.notifyIfDrained();
    });
  }

  private schedule(): void {
    while (this.active < this.globalLimit && this.queue.length > 0) {
      const index = this.queue.findIndex((pending) => this.canStart(pending.key));
      if (index < 0) return;
      const [pending] = this.queue.splice(index, 1);
      this.startTask(pending!);
    }
  }

  private notifyIfDrained(): void {
    if (this.pending !== 0) return;
    for (const resolve of this.drainWaiters) resolve();
    this.drainWaiters.clear();
  }
}
