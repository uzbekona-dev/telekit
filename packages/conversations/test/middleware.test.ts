import { VirtualClock, type CallbackQuery, type Chat, type Context, type Update, type User } from "@telekit/core";
import type { Kysely } from "kysely";
import type { TelekitDatabase } from "@telekit/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineConversation } from "../src/define-conversation.js";
import { ConversationTooLongError } from "../src/errors.js";
import { installConversations } from "../src/middleware.js";
import { DatabaseConversationStore, type ConversationPatch, type ConversationStore, type NewConversation } from "../src/store.js";
import { createTestDatabase } from "./helpers/test-db.js";

function fakeUser(id: number): User {
  return { id, is_bot: false, first_name: "Test" };
}
function fakeChat(id: number): Chat {
  return { id, type: "private" };
}

function fakeCtx(update: Update, overrides: Partial<Context> = {}): Context {
  const message = update.message;
  const callback = update.callback_query;
  return {
    update,
    message,
    chat: message?.chat ?? callback?.message?.chat,
    from: message?.from ?? callback?.from,
    callback,
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

function textMsg(chatId: number, userId: number, text: string, updateId: number): Update {
  return {
    update_id: updateId,
    message: { message_id: updateId, date: 0, chat: fakeChat(chatId), from: fakeUser(userId), text },
  };
}

function callbackMsg(chatId: number, userId: number, data: string, updateId: number): Update {
  const callback_query: CallbackQuery = {
    id: `q${updateId}`,
    from: fakeUser(userId),
    chat_instance: "1",
    data,
    message: { message_id: updateId, date: 0, chat: fakeChat(chatId) },
  };
  return { update_id: updateId, callback_query };
}

const register = defineConversation(
  "register",
  async (flow, _ctx) => {
    const name = await flow.text("Ismingizni kiriting:");
    const age = await flow.number("Yoshingiz:", { min: 14, max: 100, retry: 2, invalidMessage: "Noto'g'ri yosh" });
    const likes = await flow.confirm("Botni yoqtirasizmi?");
    await flow.reply(`Salom ${name}, ${age} yosh, yoqtiradi=${likes}`);
  },
  {
    cancelCommands: ["/cancel"],
    timeout: "30m",
    onCancel: async (flow) => flow.reply("Bekor qilindi"),
    onTimeout: async (flow) => flow.reply("Vaqt tugadi"),
  },
);

describe("installConversations — full multi-turn round trip", () => {
  let db: Kysely<TelekitDatabase>;

  afterEach(async () => {
    await db?.destroy();
  });

  it("drives a complete register conversation across 5 real turns, persisted through a real DB store", async () => {
    db = await createTestDatabase();
    const store = new DatabaseConversationStore(db);
    const middleware = installConversations([register], { store });

    // Turn 1: /register triggers ctx.enter() from within "routing" (the next() callback).
    const ctx1 = fakeCtx(textMsg(1, 1, "/register", 1));
    await middleware(ctx1, async () => {
      await ctx1.enter!("register");
    });
    expect(ctx1.reply).toHaveBeenCalledWith("Ismingizni kiriting:", undefined);

    // Turn 2: answers name — the middleware must NOT fall through to next() (normal routing).
    const ctx2 = fakeCtx(textMsg(1, 1, "Ali", 2));
    const next2 = vi.fn();
    await middleware(ctx2, next2);
    expect(next2).not.toHaveBeenCalled();
    expect(ctx2.reply).toHaveBeenCalledWith("Yoshingiz:", undefined);

    // Turn 3: invalid age — re-prompts with the invalid message, does not advance.
    const ctx3 = fakeCtx(textMsg(1, 1, "not-a-number", 3));
    await middleware(ctx3, vi.fn());
    expect(ctx3.reply).toHaveBeenCalledWith("Noto'g'ri yosh");

    // Turn 4: valid age — proceeds to the confirm() choice prompt.
    const ctx4 = fakeCtx(textMsg(1, 1, "25", 4));
    await middleware(ctx4, vi.fn());
    expect(ctx4.reply).toHaveBeenCalledWith("Botni yoqtirasizmi?", expect.objectContaining({ reply_markup: expect.anything() }));

    // Turn 5: taps "yes" — conversation completes and replies with the final summary.
    const ctx5 = fakeCtx(callbackMsg(1, 1, "__flow_choice__:0", 5));
    await middleware(ctx5, vi.fn());
    expect(ctx5.reply).toHaveBeenCalledWith("Salom Ali, 25 yosh, yoqtiradi=true", undefined);

    expect(await store.findActive("user-chat:1:1")).toBeNull(); // finished — no longer active
  });

  it("cancelCommands mid-conversation runs onCancel instead of treating it as an answer", async () => {
    db = await createTestDatabase();
    const store = new DatabaseConversationStore(db);
    const middleware = installConversations([register], { store });

    const ctx1 = fakeCtx(textMsg(2, 2, "/register", 10));
    await middleware(ctx1, async () => ctx1.enter!("register"));

    const ctx2 = fakeCtx(textMsg(2, 2, "/cancel", 11));
    await middleware(ctx2, vi.fn());

    expect(ctx2.reply).toHaveBeenCalledWith("Bekor qilindi", undefined);
    expect(await store.findActive("user-chat:2:2")).toBeNull();
  });

  it("exceeding retry attempts exits the conversation instead of asking forever", async () => {
    db = await createTestDatabase();
    const store = new DatabaseConversationStore(db);
    const middleware = installConversations([register], { store });

    const ctx1 = fakeCtx(textMsg(3, 3, "/register", 20));
    await middleware(ctx1, async () => ctx1.enter!("register"));
    const ctx2 = fakeCtx(textMsg(3, 3, "Ali", 21));
    await middleware(ctx2, vi.fn());

    // retry: 2 -> 3 total attempts allowed before giving up.
    await middleware(fakeCtx(textMsg(3, 3, "bad1", 22)), vi.fn());
    await middleware(fakeCtx(textMsg(3, 3, "bad2", 23)), vi.fn());
    await middleware(fakeCtx(textMsg(3, 3, "bad3", 24)), vi.fn());

    expect(await store.findActive("user-chat:3:3")).toBeNull(); // gave up — conversation finished
  });

  it("an expired conversation runs onTimeout on the next incoming update instead of continuing", async () => {
    db = await createTestDatabase();
    const store = new DatabaseConversationStore(db);
    const middleware = installConversations([register], { store });

    const ctx1 = fakeCtx(textMsg(4, 4, "/register", 30));
    await middleware(ctx1, async () => ctx1.enter!("register"));

    // Simulate elapsed time by backdating expiresAt directly in the store.
    const active = await store.findActive("user-chat:4:4");
    await store.update(active!.id, { expiresAt: new Date(Date.now() - 1000) }, active!.version);

    const ctx2 = fakeCtx(textMsg(4, 4, "Ali", 31));
    await middleware(ctx2, vi.fn());

    expect(ctx2.reply).toHaveBeenCalledWith("Vaqt tugadi", undefined);
    expect(await store.findActive("user-chat:4:4")).toBeNull();
  });

  it("throws ConversationTooLongError once the log exceeds maxSteps", async () => {
    db = await createTestDatabase();
    const store = new DatabaseConversationStore(db);
    const middleware = installConversations([register], { store, maxSteps: 1 });

    const ctx1 = fakeCtx(textMsg(5, 5, "/register", 40));
    await middleware(ctx1, async () => ctx1.enter!("register"));

    // 1st answer -> log has 1 entry (== maxSteps, not over yet).
    await middleware(fakeCtx(textMsg(5, 5, "Ali", 41)), vi.fn());
    // 2nd answer -> log would grow to 2 entries (> maxSteps: 1).
    await expect(middleware(fakeCtx(textMsg(5, 5, "25", 42)), vi.fn())).rejects.toBeInstanceOf(ConversationTooLongError);
  });

  it("scopes conversations independently per chat/user key", async () => {
    db = await createTestDatabase();
    const store = new DatabaseConversationStore(db);
    const middleware = installConversations([register], { store });

    const ctxA = fakeCtx(textMsg(6, 6, "/register", 50));
    await middleware(ctxA, async () => ctxA.enter!("register"));
    const ctxB = fakeCtx(textMsg(7, 7, "/register", 51));
    await middleware(ctxB, async () => ctxB.enter!("register"));

    expect(await store.findActive("user-chat:6:6")).not.toBeNull();
    expect(await store.findActive("user-chat:7:7")).not.toBeNull();

    // Answering user 6's doesn't touch user 7's.
    await middleware(fakeCtx(textMsg(6, 6, "Ali", 52)), vi.fn());
    const stillActiveB = await store.findActive("user-chat:7:7");
    expect(stillActiveB?.log.entries).toEqual([]);
  });
});

describe("installConversations — ctx.conversation, clock and callback answers", () => {
  let db: Kysely<TelekitDatabase>;

  afterEach(async () => {
    await db?.destroy();
  });

  it("reports the outcome of every turn on ctx.conversation", async () => {
    db = await createTestDatabase();
    const middleware = installConversations([register], { store: new DatabaseConversationStore(db) });

    const ctx1 = fakeCtx(textMsg(8, 8, "/register", 60));
    await middleware(ctx1, async () => ctx1.enter!("register"));
    expect(ctx1.conversation).toEqual({ name: "register", status: "active" });

    const unrelated = fakeCtx(textMsg(9, 9, "salom", 61));
    await middleware(unrelated, vi.fn());
    expect(unrelated.conversation).toBeUndefined();

    await middleware(fakeCtx(textMsg(8, 8, "Ali", 62)), vi.fn());
    await middleware(fakeCtx(textMsg(8, 8, "25", 63)), vi.fn());
    const last = fakeCtx(callbackMsg(8, 8, "__flow_choice__:1", 64));
    await middleware(last, vi.fn());
    expect(last.conversation).toEqual({ name: "register", status: "done" });
  });

  it("answers the callback query of a tapped choice button, even when the tap is invalid", async () => {
    db = await createTestDatabase();
    const middleware = installConversations([register], { store: new DatabaseConversationStore(db) });
    const ctx1 = fakeCtx(textMsg(10, 10, "/register", 70));
    await middleware(ctx1, async () => ctx1.enter!("register"));

    const staleTap = fakeCtx(callbackMsg(10, 10, "old-button", 71));
    await middleware(staleTap, vi.fn());
    expect(staleTap.answerCallback).toHaveBeenCalledTimes(1);
    expect(staleTap.reply).toHaveBeenCalledWith("Tushunmadim, qaytadan urinib ko'ring.");

    const failingAnswer = fakeCtx(textMsg(10, 10, "Ali", 72), {
      answerCallback: vi.fn().mockRejectedValue(new Error("query is too old")),
    });
    await expect(middleware(failingAnswer, vi.fn())).resolves.toBeUndefined();
    expect(failingAnswer.answerCallback).not.toHaveBeenCalled(); // text answer — no callback to answer
  });

  it("stores a cancel as 'cancelled', not 'done'", async () => {
    db = await createTestDatabase();
    const store = new DatabaseConversationStore(db);
    const middleware = installConversations([register], { store });
    const ctx1 = fakeCtx(textMsg(11, 11, "/register", 80));
    await middleware(ctx1, async () => ctx1.enter!("register"));

    const cancel = fakeCtx(textMsg(11, 11, "/cancel", 81));
    await middleware(cancel, vi.fn());

    expect(cancel.conversation).toEqual({ name: "register", status: "cancelled" });
    const row = await db.selectFrom("telekit_conversations" as never).selectAll().executeTakeFirst();
    expect((row as { status: string }).status).toBe("cancelled");
  });

  it("expires against the injected clock, exactly at the deadline", async () => {
    db = await createTestDatabase();
    const clock = new VirtualClock(1_000_000);
    const middleware = installConversations([register], { store: new DatabaseConversationStore(db), clock });
    const ctx1 = fakeCtx(textMsg(12, 12, "/register", 90));
    await middleware(ctx1, async () => ctx1.enter!("register"));

    await clock.advance(30 * 60_000 - 1);
    const early = fakeCtx(textMsg(12, 12, "Ali", 91));
    await middleware(early, vi.fn());
    expect(early.conversation?.status).toBe("active");

    await clock.advance(30 * 60_000); // the answer above pushed the deadline out by another 30m
    const onTime = fakeCtx(textMsg(12, 12, "25", 92));
    await middleware(onTime, vi.fn());
    expect(onTime.conversation).toEqual({ name: "register", status: "timeout" });
    expect(onTime.reply).toHaveBeenCalledWith("Vaqt tugadi", undefined);
  });

  it("flow.now() reads the injected clock", async () => {
    db = await createTestDatabase();
    const clock = new VirtualClock(1_234_000);
    let seen = 0;
    const timed = defineConversation("timed", async (flow) => {
      seen = flow.now();
    });
    const middleware = installConversations([timed], { store: new DatabaseConversationStore(db), clock });

    const ctx = fakeCtx(textMsg(13, 13, "/timed", 100));
    await middleware(ctx, async () => ctx.enter!("timed"));

    expect(seen).toBe(1_234_000);
    expect(ctx.conversation).toEqual({ name: "timed", status: "done" });
  });
});

/** Wraps the real store so the next update() loses an optimistic-lock race: `rival` (another instance's write) lands first. */
class RacingStore implements ConversationStore {
  rival?: (inner: DatabaseConversationStore, id: string, version: number) => Promise<unknown>;

  constructor(private readonly inner: DatabaseConversationStore) {}

  findActive(key: string) {
    return this.inner.findActive(key);
  }
  create(record: NewConversation) {
    return this.inner.create(record);
  }
  findExpired(now: Date) {
    return this.inner.findExpired(now);
  }
  async update(id: string, patch: ConversationPatch, expectedVersion: number) {
    const rival = this.rival;
    this.rival = undefined;
    if (rival) await rival(this.inner, id, expectedVersion);
    return this.inner.update(id, patch, expectedVersion);
  }
}

async function activeNames(db: Kysely<TelekitDatabase>, key: string): Promise<string[]> {
  const rows = await (db as unknown as Kysely<any>)
    .selectFrom("telekit_conversations")
    .select(["name"])
    .where("key", "=", key)
    .where("status", "=", "active")
    .execute();
  return rows.map((row: { name: string }) => row.name);
}

describe("installConversations — a turn that loses an optimistic-lock race is dropped", () => {
  let db: Kysely<TelekitDatabase>;

  afterEach(async () => {
    await db?.destroy();
  });

  it("restart: reports what is persisted, not 'active', and does not re-prompt", async () => {
    db = await createTestDatabase();
    const store = new RacingStore(new DatabaseConversationStore(db));
    const loop = defineConversation("loop", async (flow) => {
      if (await flow.confirm("Qaytadanmi?")) flow.restart();
      await flow.reply("Tugadi");
    });
    const middleware = installConversations([loop], { store });
    const ctx1 = fakeCtx(textMsg(20, 20, "/loop", 200));
    await middleware(ctx1, async () => ctx1.enter!("loop"));

    store.rival = (inner, id, version) => inner.update(id, { status: "cancelled" }, version);
    const tap = fakeCtx(callbackMsg(20, 20, "__flow_choice__:0", 201));
    await middleware(tap, vi.fn());

    expect(tap.conversation).toBeUndefined();
    expect(tap.reply).not.toHaveBeenCalled();
    expect(await activeNames(db, "user-chat:20:20")).toEqual([]);
  });

  it("goto: never enters the next conversation while the old one is still active", async () => {
    db = await createTestDatabase();
    const store = new RacingStore(new DatabaseConversationStore(db));
    const first = defineConversation("first", async (flow) => {
      if ((await flow.text("Birinchi?")) === "keyingi") flow.goto("second");
    });
    const second = defineConversation("second", async (flow) => {
      await flow.text("Ikkinchi?");
    });
    const middleware = installConversations([first, second], { store });
    const ctx1 = fakeCtx(textMsg(21, 21, "/first", 210));
    await middleware(ctx1, async () => ctx1.enter!("first"));

    store.rival = (inner, id, version) => inner.update(id, { pendingAttempts: 1 }, version);
    const next = fakeCtx(textMsg(21, 21, "keyingi", 211));
    await middleware(next, vi.fn());

    expect(await activeNames(db, "user-chat:21:21")).toEqual(["first"]);
    expect(next.conversation).toEqual({ name: "first", status: "active" });
    expect(next.reply).not.toHaveBeenCalledWith("Ikkinchi?", undefined);
  });

  it("cancel: skips onCancel when another instance already moved the conversation on", async () => {
    db = await createTestDatabase();
    const store = new RacingStore(new DatabaseConversationStore(db));
    const middleware = installConversations([register], { store });
    const ctx1 = fakeCtx(textMsg(22, 22, "/register", 220));
    await middleware(ctx1, async () => ctx1.enter!("register"));

    store.rival = (inner, id, version) => inner.update(id, { pendingAttempts: 1 }, version);
    const cancel = fakeCtx(textMsg(22, 22, "/cancel", 221));
    await middleware(cancel, vi.fn());

    expect(cancel.reply).not.toHaveBeenCalled();
    expect(cancel.conversation).toEqual({ name: "register", status: "active" });
    expect(await activeNames(db, "user-chat:22:22")).toEqual(["register"]);
  });
});
