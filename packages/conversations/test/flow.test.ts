import type { CallbackQuery, Context, Update } from "@telekit/core";
import { describe, expect, it, vi } from "vitest";
import { FlowController } from "../src/flow.js";
import { emptyLog, type ConversationLog } from "../src/log.js";
import { ConversationPause } from "../src/pause.js";

function fakeCtx(overrides: Partial<Context> = {}): Context {
  return {
    update: { update_id: 1 },
    state: {},
    locale: "uz",
    t: (key: string) => key,
    log: { trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child(): any { return this; } } as any,
    api: {} as any,
    reply: vi.fn().mockResolvedValue({ message_id: 1, date: 0, chat: { id: 1, type: "private" }, text: "" }),
    editText: vi.fn().mockResolvedValue(true),
    deleteMessage: vi.fn().mockResolvedValue(true),
    answerCallback: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as Context;
}

function textUpdate(text: string): Update {
  return { update_id: 2, message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, text } };
}

function callbackUpdate(data: string): Update {
  const callback_query: CallbackQuery = { id: "q1", from: { id: 1, is_bot: false, first_name: "T" }, chat_instance: "1", data };
  return { update_id: 2, callback_query };
}

function newController(log: ConversationLog, incomingUpdate: Update | undefined, ctx: Context, pendingAttempts = 0) {
  return new FlowController({
    name: "test",
    log,
    incomingUpdate,
    ctx,
    pendingAttempts,
    defaultInvalidMessage: "invalid",
  });
}

describe("FlowController — ask lifecycle (text)", () => {
  it("initiating turn (no incoming update): sends the prompt and pauses waiting", async () => {
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), undefined, ctx);

    let caught: unknown;
    try {
      await flow.text("Ismingiz?");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ConversationPause);
    expect((caught as ConversationPause).reason).toEqual({ type: "waiting" });
    expect(ctx.reply).toHaveBeenCalledWith("Ismingiz?", undefined);
    expect(flow.getResult().newEntries).toEqual([]); // nothing logged yet — the answer hasn't arrived
  });

  it("next turn: consumes the incoming text as the answer and continues past it", async () => {
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), textUpdate("Ali"), ctx);

    const name = await flow.text("Ismingiz?");
    expect(name).toBe("Ali");
    expect(ctx.reply).not.toHaveBeenCalled(); // no prompt re-sent — this ask was answered, not (re)started

    // A second ask reached in the SAME turn has no more incoming to consume — pauses.
    let caught: unknown;
    try {
      await flow.text("Familiyangiz?");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConversationPause);
    expect(ctx.reply).toHaveBeenCalledWith("Familiyangiz?", undefined);
    expect(flow.getResult().newEntries).toEqual([{ k: "ask", i: 0, value: "Ali" }]);
  });

  it("replay turn: a logged entry is returned without touching ctx at all", async () => {
    const ctx = fakeCtx();
    const log: ConversationLog = { version: 1, entries: [{ k: "ask", i: 0, value: "Ali" }] };
    const flow = newController(log, textUpdate("+998901234567"), ctx);

    const name = await flow.text("Ismingiz?"); // replayed — must not re-send the prompt
    expect(name).toBe("Ali");
    expect(ctx.reply).not.toHaveBeenCalled();

    const phone = await flow.text("Raqamingiz?"); // now live — consumes the real incoming update
    expect(phone).toBe("+998901234567");
    expect(flow.getResult().newEntries).toEqual([{ k: "ask", i: 1, value: "+998901234567" }]);
  });

  it("a full conversation body run across turns replays deterministically to the same completion", async () => {
    async function runTurn(log: ConversationLog, incoming: Update | undefined, ctx: Context) {
      const flow = newController(log, incoming, ctx);
      const collected: unknown[] = [];
      try {
        collected.push(await flow.text("Ismingiz?"));
        collected.push(await flow.text("Familiyangiz?"));
        return { done: true, collected, flow };
      } catch (err) {
        if (err instanceof ConversationPause) return { done: false, collected, flow };
        throw err;
      }
    }

    let log = emptyLog();
    let ctx = fakeCtx();
    let turn = await runTurn(log, undefined, ctx);
    expect(turn.done).toBe(false);
    log = { version: 1, entries: [...log.entries, ...turn.flow.getResult().newEntries] };

    ctx = fakeCtx();
    turn = await runTurn(log, textUpdate("Ali"), ctx);
    expect(turn.done).toBe(false);
    log = { version: 1, entries: [...log.entries, ...turn.flow.getResult().newEntries] };

    ctx = fakeCtx();
    turn = await runTurn(log, textUpdate("Valiyev"), ctx);
    expect(turn.done).toBe(true);
    expect(turn.collected).toEqual(["Ali", "Valiyev"]);
  });
});

describe("FlowController — number()", () => {
  it("rejects a non-numeric answer and re-prompts without advancing", async () => {
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), textUpdate("not-a-number"), ctx);

    await expect(flow.number("Yoshingiz?", { min: 14, max: 100 })).rejects.toBeInstanceOf(ConversationPause);
    expect(flow.getResult().pendingAttempts).toBe(1);
    expect(flow.getResult().newEntries).toEqual([]);
  });

  it("rejects an out-of-range answer", async () => {
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), textUpdate("5"), ctx);

    await expect(flow.number("Yoshingiz?", { min: 14, max: 100 })).rejects.toBeInstanceOf(ConversationPause);
  });

  it("accepts a valid in-range number", async () => {
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), textUpdate("25"), ctx);

    const age = await flow.number("Yoshingiz?", { min: 14, max: 100 });
    expect(age).toBe(25);
  });

  it("exits after exceeding retry attempts", async () => {
    const ctx = fakeCtx();
    // pendingAttempts already at 2 from prior failed turns; retry: 2 means 3 total tries allowed.
    const flow = newController(emptyLog(), textUpdate("bad"), ctx, 2);

    let caught: unknown;
    try {
      await flow.number("Yoshingiz?", { min: 14, max: 100, retry: 2 });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConversationPause);
    expect((caught as ConversationPause).reason).toEqual({ type: "exit" });
  });
});

describe("FlowController — contact/location/photo/document", () => {
  it("contact() extracts Message.contact", async () => {
    const update: Update = {
      update_id: 2,
      message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, contact: { phone_number: "+998901234567", first_name: "Ali" } },
    };
    const flow = newController(emptyLog(), update, fakeCtx());
    const contact = await flow.contact("Raqamingizni yuboring:");
    expect(contact.phone_number).toBe("+998901234567");
  });

  it("contact() pauses (doesn't crash) when the update has no contact", async () => {
    const flow = newController(emptyLog(), textUpdate("hello"), fakeCtx());
    await expect(flow.contact("Raqamingizni yuboring:")).rejects.toBeInstanceOf(ConversationPause);
  });
});

describe("FlowController — choice()/confirm()", () => {
  it("choice() sends a keyboard built from the options", async () => {
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), undefined, ctx);

    await expect(flow.choice("Shahringiz?", [{ value: "tas", label: "Toshkent" }, { value: "sam", label: "Samarqand" }])).rejects.toBeInstanceOf(
      ConversationPause,
    );

    expect(ctx.reply).toHaveBeenCalledWith(
      "Shahringiz?",
      expect.objectContaining({ reply_markup: expect.objectContaining({ inline_keyboard: expect.any(Array) }) }),
    );
  });

  it("choice() resolves the tapped button to its value", async () => {
    const flow = newController(emptyLog(), callbackUpdate("__flow_choice__:1"), fakeCtx());
    const city = await flow.choice("Shahringiz?", [{ value: "tas", label: "Toshkent" }, { value: "sam", label: "Samarqand" }]);
    expect(city).toBe("sam");
  });

  it("choice() also accepts the option's label typed as plain text", async () => {
    const flow = newController(emptyLog(), textUpdate("Samarqand"), fakeCtx());
    const city = await flow.choice("Shahringiz?", [{ value: "tas", label: "Toshkent" }, { value: "sam", label: "Samarqand" }]);
    expect(city).toBe("sam");
  });

  it("confirm() resolves yes/no taps to booleans", async () => {
    const yes = await newController(emptyLog(), callbackUpdate("__flow_choice__:0"), fakeCtx()).confirm("Rozimisiz?");
    expect(yes).toBe(true);
    const no = await newController(emptyLog(), callbackUpdate("__flow_choice__:1"), fakeCtx()).confirm("Rozimisiz?");
    expect(no).toBe(false);
  });
});

describe("FlowController — nondeterminism capture", () => {
  it("external(): computes and logs on first run, replays without recomputing", async () => {
    const compute = vi.fn().mockResolvedValue(42);
    const flow1 = newController(emptyLog(), undefined, fakeCtx());
    const result1 = await flow1.external("check", compute);
    expect(result1).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);

    const log: ConversationLog = { version: 1, entries: flow1.getResult().newEntries };
    const flow2 = newController(log, undefined, fakeCtx());
    const result2 = await flow2.external("check", compute);
    expect(result2).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1); // still 1 — NOT re-invoked on replay
  });

  it("random.int()/now()/uuid(): replay returns the exact same value without recomputing", () => {
    const flow1 = newController(emptyLog(), undefined, fakeCtx());
    const rnd1 = flow1.random.int(1, 1_000_000);
    const now1 = flow1.now();
    const uid1 = flow1.uuid();

    const log: ConversationLog = { version: 1, entries: flow1.getResult().newEntries };
    const flow2 = newController(log, undefined, fakeCtx());
    expect(flow2.random.int(1, 1_000_000)).toBe(rnd1);
    expect(flow2.now()).toBe(now1);
    expect(flow2.uuid()).toBe(uid1);
  });
});

describe("FlowController — checkpoint", () => {
  it("computes once, memoizes across replay", async () => {
    const compute = vi.fn().mockResolvedValue({ total: 100 });
    const flow1 = newController(emptyLog(), undefined, fakeCtx());
    const cart1 = await flow1.checkpoint("cart", compute);
    expect(cart1).toEqual({ total: 100 });

    const log: ConversationLog = { version: 1, entries: flow1.getResult().newEntries };
    const flow2 = newController(log, undefined, fakeCtx());
    const cart2 = await flow2.checkpoint("cart", compute);
    expect(cart2).toEqual({ total: 100 });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("accepts a plain value instead of a thunk", async () => {
    const flow = newController(emptyLog(), undefined, fakeCtx());
    expect(await flow.checkpoint("x", { a: 1 })).toEqual({ a: 1 });
  });
});

describe("FlowController — output methods respect replay vs live", () => {
  it("reply()/edit()/delete() are no-ops during pure replay", async () => {
    const ctx = fakeCtx();
    const log: ConversationLog = { version: 1, entries: [{ k: "ask", i: 0, value: "Ali" }] };
    const flow = newController(log, undefined, ctx);

    await flow.reply("this should not send — still replaying");
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("reply() sends for real once the run is live", async () => {
    const ctx = fakeCtx();
    const flow = newController({ version: 1, entries: [{ k: "rnd", i: 0, value: 3 }] }, textUpdate("x"), ctx);
    flow.random.int(1, 10); // replays the logged value — still not live
    await flow.reply("replayed");
    flow.random.int(1, 10); // past the log's end — live from here on
    await flow.reply("hello");
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalledWith("hello", undefined);
  });

  it("the entering turn sends output that comes before the first ask (e.g. a greeting)", async () => {
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), undefined, ctx);

    await flow.reply("Xush kelibsiz!");
    await expect(flow.text("Ismingiz?")).rejects.toBeInstanceOf(ConversationPause);

    expect(ctx.reply).toHaveBeenNthCalledWith(1, "Xush kelibsiz!", undefined);
    expect(ctx.reply).toHaveBeenNthCalledWith(2, "Ismingiz?", undefined);
  });

  it("the turn answering the first ask does not re-send that greeting", async () => {
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), textUpdate("Ali"), ctx);

    await flow.reply("Xush kelibsiz!");
    expect(await flow.text("Ismingiz?")).toBe("Ali");

    expect(ctx.reply).not.toHaveBeenCalled();
  });
});

describe("FlowController — control flow", () => {
  it("exit() throws a pause with reason 'exit'", () => {
    const flow = newController(emptyLog(), undefined, fakeCtx());
    expect(() => flow.exit()).toThrow(ConversationPause);
    try {
      flow.exit();
    } catch (err) {
      expect((err as ConversationPause).reason).toEqual({ type: "exit" });
    }
  });

  it("goto() throws a pause carrying the target name and params", () => {
    const flow = newController(emptyLog(), undefined, fakeCtx());
    try {
      flow.goto("other", { x: 1 });
      expect.unreachable();
    } catch (err) {
      expect((err as ConversationPause).reason).toEqual({ type: "goto", name: "other", params: { x: 1 } });
    }
  });
});

describe("FlowController — optional()", () => {
  async function paused(run: () => Promise<unknown>): Promise<void> {
    await expect(run()).rejects.toBeInstanceOf(ConversationPause);
  }

  it("adds a skip row under the prompt (after any existing keyboard)", async () => {
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), undefined, ctx);

    await paused(() => flow.optional("⏭ O'tkazish", () => flow.choice("Qaysi?", [{ value: 1, label: "Bir" }])));

    expect(ctx.reply).toHaveBeenCalledWith("Qaysi?", {
      reply_markup: {
        inline_keyboard: [[{ text: "Bir", callback_data: "__flow_choice__:0" }], [{ text: "⏭ O'tkazish", callback_data: "__flow_skip__" }]],
      },
    });
  });

  it("resolves null when skipped — without running validation — and logs it for replay", async () => {
    const flow = newController(emptyLog(), callbackUpdate("__flow_skip__"), fakeCtx());
    const validate = vi.fn(() => false as const);

    expect(await flow.optional("skip", () => flow.text("Izoh?", { validate }))).toBeNull();

    expect(validate).not.toHaveBeenCalled();
    const log: ConversationLog = { version: 1, entries: flow.getResult().newEntries };
    expect(log.entries).toEqual([{ k: "ask", i: 0, value: null }]);
    const replay = newController(log, textUpdate("keyingi"), fakeCtx());
    expect(await replay.optional("skip", () => replay.text("Izoh?"))).toBeNull();
  });

  it("still accepts a normal answer, and the skip button only applies to the wrapped ask", async () => {
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), textUpdate("zo'r"), ctx);

    expect(await flow.optional("skip", () => flow.text("Izoh?"))).toBe("zo'r");
    await paused(() => flow.text("Keyingi savol"));

    expect(ctx.reply).toHaveBeenCalledWith("Keyingi savol", undefined);
  });

  it("a skip tap on a non-optional ask is just an invalid answer", async () => {
    const ctx = fakeCtx();
    const flow = newController(emptyLog(), callbackUpdate("__flow_skip__"), ctx);

    await paused(() => flow.text("Ism?"));

    expect(ctx.reply).toHaveBeenCalledWith("invalid");
  });
});
