import type { Message } from "@telekit/types";
import { describe, expect, it } from "vitest";
import { createContext, type Context } from "../src/context.js";
import { createLogger } from "../src/logger.js";
import { Router } from "../src/router.js";

let nextUpdateId = 1;

/**
 * Builds a real Context via `createContext` (not a hand-rolled stub) so
 * `ctx.update.message` and the `ctx.message` shortcut stay consistent —
 * exactly what `resolveEventTypes` and the router actually read.
 */
function fakeContext(message?: Message): Context {
  return createContext(
    { update_id: nextUpdateId++, message },
    { api: {} as Context["api"], log: createLogger({ level: "error" }), locale: "uz", t: (key) => key },
  );
}

function textMessage(text: string, chatType: "private" | "group" = "private"): Message {
  return { message_id: 1, date: 0, chat: { id: 1, type: chatType }, text };
}

describe("Router", () => {
  it("dispatches a matching command and passes the remaining text as args", async () => {
    const router = new Router();
    let received: string | undefined;
    router.registerCommand({
      name: "profile",
      handle: (_ctx, args) => {
        received = args;
      },
    });

    const ctx = fakeContext(textMessage("/profile 42"));
    const handled = await router.dispatch(ctx);

    expect(handled).toBe(true);
    expect(received).toBe("42");
  });

  it("resolves command aliases and is case-insensitive", async () => {
    const router = new Router();
    let calls = 0;
    router.registerCommand({ name: "help", aliases: ["h"], handle: () => { calls++; } });

    await router.dispatch(fakeContext(textMessage("/H")));
    await router.dispatch(fakeContext(textMessage("/h@my_bot")));

    expect(calls).toBe(2);
  });

  it("falls through to event handlers when no command matches", async () => {
    const router = new Router();
    let sawText: string | undefined;
    router.registerEvent({
      type: "message:text",
      handle: (ctx) => {
        sawText = ctx.message?.text;
      },
    });

    const handled = await router.dispatch(fakeContext(textMessage("salom")));

    expect(handled).toBe(true);
    expect(sawText).toBe("salom");
  });

  it("skips an event whose filter rejects the update", async () => {
    const router = new Router();
    let ran = false;
    router.registerEvent({
      type: "message:text",
      filter: (ctx) => ctx.chat?.type === "group",
      handle: () => {
        ran = true;
      },
    });

    const handled = await router.dispatch(fakeContext(textMessage("hi", "private")));

    expect(handled).toBe(false);
    expect(ran).toBe(false);
  });

  it("returns false when nothing matches", async () => {
    const router = new Router();
    const handled = await router.dispatch(fakeContext());
    expect(handled).toBe(false);
  });

  it("runs route-level middleware before the handler, in order", async () => {
    const router = new Router();
    const order: string[] = [];
    router.registerCommand({
      name: "secure",
      middleware: [
        async (_ctx, next) => {
          order.push("mw1:before");
          await next();
          order.push("mw1:after");
        },
        async (_ctx, next) => {
          order.push("mw2:before");
          await next();
          order.push("mw2:after");
        },
      ],
      handle: () => {
        order.push("handler");
      },
    });

    await router.dispatch(fakeContext(textMessage("/secure")));

    expect(order).toEqual(["mw1:before", "mw2:before", "handler", "mw2:after", "mw1:after"]);
  });
});
