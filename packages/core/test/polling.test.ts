import type { Update } from "@telekit/types";
import { describe, expect, it, vi } from "vitest";
import type { TelegramApi } from "../src/telegram/client.js";
import { Poller } from "../src/telegram/polling.js";

describe("Poller", () => {
  it("stop() aborts capacity waiting without waiting forever for a stuck handler", async () => {
    let getUpdatesCalls = 0;
    const updates: Update[] = [{ update_id: 1 }, { update_id: 2 }];
    const api = {
      getUpdates: vi.fn(async (_params: unknown, options: { signal?: AbortSignal }) => {
        if (getUpdatesCalls++ === 0) return updates;
        return new Promise<Update[]>((_, reject) => {
          options.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      }),
    } as unknown as TelegramApi;

    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const onUpdate = vi.fn(() => held);
    const poller = new Poller({ api, maxInFlight: 1, onUpdate });
    poller.start();
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    await expect(Promise.race([
      poller.stop().then(() => "stopped"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 100)),
    ])).resolves.toBe("stopped");

    release();
  });
});
