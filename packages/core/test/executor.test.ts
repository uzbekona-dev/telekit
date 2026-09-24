import { describe, expect, it } from "vitest";
import { ShutdownTimeoutError, UpdateExecutor, UpdateExecutorClosedError, UpdateQueueFullError } from "../src/pipeline/executor.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("UpdateExecutor", () => {
  it("orders one chat while running different chats in parallel", async () => {
    const executor = new UpdateExecutor(2, 1, 10);
    const a = deferred();
    const order: string[] = [];

    const first = executor.run(1, async () => { order.push("a1:start"); await a.promise; order.push("a1:end"); });
    const second = executor.run(1, async () => { order.push("a2"); });
    const other = executor.run(2, async () => { order.push("b1"); });
    await Promise.resolve();

    expect(order).toEqual(["a1:start", "b1"]);
    a.resolve();
    await Promise.all([first, second, other]);
    expect(order).toEqual(["a1:start", "b1", "a1:end", "a2"]);
  });

  it("rejects overload instead of growing an unbounded queue", async () => {
    const executor = new UpdateExecutor(1, 1, 1);
    const hold = deferred();
    const running = executor.run(1, () => hold.promise);
    const queued = executor.run(2, async () => {});
    await expect(executor.run(3, async () => {})).rejects.toBeInstanceOf(UpdateQueueFullError);
    hold.resolve();
    await Promise.all([running, queued]);
  });

  it("stops admission, drains accepted work, and times out stuck work", async () => {
    const executor = new UpdateExecutor(1, 1, 1);
    const hold = deferred();
    const running = executor.run(1, () => hold.promise);
    executor.stopAccepting();

    await expect(executor.run(2, async () => {})).rejects.toBeInstanceOf(UpdateExecutorClosedError);
    await expect(executor.drain(5)).rejects.toBeInstanceOf(ShutdownTimeoutError);
    hold.resolve();
    await running;
    await expect(executor.drain(5)).resolves.toBeUndefined();
  });
});
