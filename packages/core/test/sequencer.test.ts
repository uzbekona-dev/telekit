import { describe, expect, it } from "vitest";
import { ChatSequencer } from "../src/pipeline/sequencer.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("ChatSequencer", () => {
  it("runs updates from the same chat strictly in arrival order", async () => {
    const sequencer = new ChatSequencer();
    const order: number[] = [];

    const first = sequencer.run(1, async () => {
      await delay(20); // slower task queued first
      order.push(1);
    });
    const second = sequencer.run(1, async () => {
      await delay(1); // faster task queued second — must still finish after the first
      order.push(2);
    });

    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
  });

  it("runs different chats fully in parallel", async () => {
    const sequencer = new ChatSequencer();
    const startedAt: number[] = [];

    await Promise.all([
      sequencer.run(1, async () => {
        startedAt.push(Date.now());
        await delay(20);
      }),
      sequencer.run(2, async () => {
        startedAt.push(Date.now());
        await delay(20);
      }),
    ]);

    // Both tasks should have started within a few ms of each other, not
    // serialized (which would show ~20ms apart).
    expect(Math.abs(startedAt[0]! - startedAt[1]!)).toBeLessThan(15);
  });

  it("a failed task does not block the next update for that chat", async () => {
    const sequencer = new ChatSequencer();
    const order: string[] = [];

    const first = sequencer
      .run(1, async () => {
        order.push("first");
        throw new Error("boom");
      })
      .catch(() => {});
    const second = sequencer.run(1, async () => {
      order.push("second");
    });

    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
  });

  it("cleans up its internal chain once a chat goes quiet", async () => {
    const sequencer = new ChatSequencer();
    await sequencer.run(1, async () => {});
    // Give the .finally() cleanup microtask a turn to run.
    await Promise.resolve();
    await Promise.resolve();
    expect(sequencer.activeChatCount).toBe(0);
  });
});
