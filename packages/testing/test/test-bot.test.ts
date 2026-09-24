import path from "node:path";
import { fileURLToPath } from "node:url";
import { btn, InputFile, keyboard, loadLocales } from "@telekit/core";
import { afterEach, describe, expect, it } from "vitest";
import { createTestBot, type TestBot } from "../src/index.js";
import "../src/vitest-setup.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("createTestBot — spec §28.2 basics", () => {
  let bot: TestBot;
  afterEach(async () => {
    await bot.close();
  });

  it("/start saves a new user and replies (spec §28.2 example)", async () => {
    bot = await createTestBot({
      locale: "uz",
      user: { id: 1, first_name: "Test", username: "tester" },
      setup: (app) => {
        app.command("start", (ctx) => ctx.reply(`Assalomu alaykum, ${ctx.from?.first_name}!`).then(() => {}));
      },
    });

    const res = await bot.command("start");

    expect(res.replies).toHaveLength(1);
    expect(res.replies[0]?.text).toContain("Assalomu alaykum");
    expect(res.replies[0]?.chat_id).toBe(1);
    expect(await bot.db?.users.count()).toBe(1);
    expect(res).toHaveReplied();
    expect(res).toHaveRepliedWith(/Assalomu/);
    expect(res).not.toHaveRepliedWith("Hayr");
  });

  it("passes command args and records every API call", async () => {
    bot = await createTestBot({
      setup: (app) => {
        app.command("echo", async (ctx) => {
          await ctx.reply(`args=${ctx.message?.text?.split(" ").slice(1).join(" ")}`);
        });
      },
    });

    const res = await bot.command("echo", { args: "123 abc" });

    expect(res).toHaveRepliedWith("args=123 abc");
    expect(res).toHaveCalledApi("sendMessage");
    expect(res).not.toHaveCalledApi("sendPhoto");
    expect(res.apiCalls).toEqual([expect.objectContaining({ method: "sendMessage", ok: true })]);
    expect(res.duration).toBeGreaterThanOrEqual(0);
  });

  it("works without a database", async () => {
    bot = await createTestBot({
      database: "none",
      setup: (app) => {
        app.command("ping", async (ctx) => {
          await ctx.reply(ctx.user ? "user" : "no-user");
        });
      },
    });

    const res = await bot.command("ping");

    expect(bot.db).toBeUndefined();
    expect(res).toHaveRepliedWith("no-user");
  });

  it("an empty result fails toHaveReplied with a readable message", async () => {
    bot = await createTestBot();

    const res = await bot.message("hech kim tinglamaydi");

    expect(res).not.toHaveReplied();
    expect(() => expect(res).toHaveReplied()).toThrow("Bot javob yubormadi");
    expect(() => expect({}).toHaveReplied()).toThrow(TypeError);
  });
});

describe("createTestBot — inputs (spec §28.3 Kirish)", () => {
  let bot: TestBot;
  afterEach(async () => {
    await bot.close();
  });

  it("message / photo / document / contact / location reach the matching events", async () => {
    const seen: string[] = [];
    bot = await createTestBot({
      setup: (app) => {
        app.event("message:text", (ctx) => void seen.push(`text:${ctx.message?.text}`));
        app.event("message:photo", (ctx) => void seen.push(`photo:${ctx.message?.caption}`));
        app.event("message:document", (ctx) => void seen.push(`doc:${ctx.message?.document?.file_name}`));
        app.event("message:contact", (ctx) => void seen.push(`contact:${ctx.message?.contact?.phone_number}`));
        app.event("message:location", (ctx) => void seen.push(`loc:${ctx.message?.location?.latitude}`));
      },
    });

    await bot.message("Salom");
    await bot.photo({ caption: "rasm", file_size: 10 });
    await bot.document({ file_name: "a.pdf", mime_type: "application/pdf", file_size: 5, caption: "c" });
    await bot.contact({ phone_number: "+998901234567" });
    await bot.location({ latitude: 41.3, longitude: 69.2 });

    expect(seen).toEqual(["text:Salom", "photo:rasm", "doc:a.pdf", "contact:+998901234567", "loc:41.3"]);
  });

  it("photo()/document() accept InputFile fixtures that ctx.download() reads back (spec §28.3)", async () => {
    const downloads: string[] = [];
    bot = await createTestBot({
      setup: (app) => {
        app.event("message:photo", async (ctx) => {
          const size = ctx.message!.photo!.at(-1)!;
          const file = await ctx.download(size.file_id);
          downloads.push(`photo:${size.file_size}:${(await file.buffer()).toString("hex")}:${ctx.message?.caption}`);
          await file.dispose();
        });
        app.event("message:document", async (ctx) => {
          const doc = ctx.message!.document!;
          const file = await ctx.download(doc.file_id);
          downloads.push(`doc:${doc.file_name}:${doc.mime_type}:${doc.file_size}:${(await file.buffer()).toString("utf8")}`);
          await file.dispose();
        });
      },
    });

    await bot.photo(InputFile.buffer(new Uint8Array([1, 2, 3]), "p.png"), { caption: "rasm" });
    await bot.document(InputFile.path(path.join(here, "fixtures", "files", "hello.txt")));
    await bot.document(InputFile.buffer(new TextEncoder().encode("{}"), "data.bin"), {
      file_name: "renamed.bin",
      mime_type: "application/octet-stream",
    });
    await bot.document(InputFile.buffer(new Uint8Array([0]), "no-extension"));

    expect(downloads).toEqual([
      "photo:3:010203:rasm",
      "doc:hello.txt:text/plain:13:salom fixture",
      "doc:renamed.bin:application/octet-stream:2:{}",
      "doc:no-extension:undefined:1:\u0000",
    ]);
  });

  it("as() switches the sender and inChat() the chat", async () => {
    const seen: Array<{ from?: number; chat?: number; type?: string }> = [];
    bot = await createTestBot({
      setup: (app) => {
        app.event("message:text", (ctx) => void seen.push({ from: ctx.from?.id, chat: ctx.chat?.id, type: ctx.chat?.type }));
      },
    });

    await bot.message("1");
    await bot.as({ id: 2, first_name: "Boshqa" }).message("2");
    await bot.inChat({ id: -100123, type: "supergroup" }).message("3");
    await bot.as({ id: 3 }).inChat({ id: -100123, type: "supergroup" }).message("4");

    expect(seen).toEqual([
      { from: 1, chat: 1, type: "private" },
      { from: 2, chat: 2, type: "private" },
      { from: 1, chat: -100123, type: "supergroup" },
      { from: 3, chat: -100123, type: "supergroup" },
    ]);
    expect(await bot.db?.users.count()).toBe(3);
    expect((await bot.db?.users.all())?.map((u) => u.id)).toEqual([1, 2, 3]);
  });

  it("callback presses edit the bot's last message and answer the query", async () => {
    const encode = (payload: { n: number }) => `count:${payload.n}`;
    bot = await createTestBot({
      setup: (app) => {
        app.command("counter", async (ctx) => {
          await ctx.reply("0", { reply_markup: keyboard().row(btn.callback("➕ +1", encode({ n: 1 }))) });
        });
        app.event("callback_query", async (ctx) => {
          const n = Number(ctx.callback?.data?.split(":")[1]);
          await ctx.editText(String(n), { reply_markup: keyboard().row(btn.callback("🔄 Reset", encode({ n: 0 }))) });
          await ctx.answerCallback({ text: "ok" });
        });
      },
    });

    const first = await bot.command("counter");
    expect(first).toHaveButton("➕ +1");
    expect(first).toHaveButton(/\+1/);

    const res = await bot.callback(encode, { n: 1 });

    expect(res.edits).toHaveLength(1);
    expect(res.edits[0]).toMatchObject({ text: "1", message_id: 1, chat_id: 1 });
    expect(res).toHaveButton("🔄 Reset");
    expect(res).not.toHaveButton("➕ +1");
    expect(res).toHaveAnsweredCallback();
    expect(res.answeredCallback).toMatchObject({ text: "ok" });

    const raw = await bot.callbackRaw("count:5", { messageId: 77 });
    expect(raw.edits[0]).toMatchObject({ text: "5", message_id: 77 });
  });

  it("inline queries, chat member updates and raw updates are delivered", async () => {
    const seen: string[] = [];
    bot = await createTestBot({
      setup: (app) => {
        app.event("inline_query", async (ctx) => {
          seen.push(`inline:${ctx.update.inline_query?.query}`);
          await ctx.api.answerInlineQuery({ inline_query_id: ctx.update.inline_query!.id, results: [] });
        });
        app.event("chat_member", (ctx) => {
          const u = ctx.update.chat_member!;
          seen.push(`member:${u.old_chat_member.status}->${u.new_chat_member.status}`);
        });
        app.event("edited_message", (ctx) => void seen.push(`edited:${ctx.update.edited_message?.text}`));
      },
    });

    const inline = await bot.inlineQuery("qidiruv");
    await bot.inChat({ id: -1, type: "group" }).chatMember({ old_chat_member: "left", new_chat_member: "member" });
    await bot.send({ edited_message: { message_id: 1, date: 0, chat: bot.chat, from: bot.user, text: "yangi" } });

    expect(inline).toHaveCalledApi("answerInlineQuery");
    expect(seen).toEqual(["inline:qidiruv", "member:left->member", "edited:yangi"]);
  });
});

describe("createTestBot — results, errors and mocks (spec §28.3–28.4)", () => {
  let bot: TestBot;
  afterEach(async () => {
    await bot.close();
  });

  it("captures handler errors in res.error while onError still runs", async () => {
    bot = await createTestBot({
      setup: (app) => {
        app.command("boom", () => {
          throw new Error("portladi");
        });
        app.onError(async (_err, ctx) => {
          await ctx.reply("xato ushlandi");
        });
      },
    });

    const res = await bot.command("boom");

    expect(res.error).toBeInstanceOf(Error);
    expect((res.error as Error).message).toBe("portladi");
    expect(res).toHaveRepliedWith("xato ushlandi");
  });

  it("records deletes and multipart uploads", async () => {
    bot = await createTestBot({
      setup: (app) => {
        app.command("clean", async (ctx) => {
          await ctx.deleteMessage();
          await ctx.replyWithDocument(
            { filename: "r.txt", toBlob: async () => new Blob(["hi"]) },
            { caption: "123" },
          );
        });
      },
    });

    const res = await bot.command("clean");

    expect(res.deletes).toEqual([{ chat_id: 1, message_id: expect.any(Number) }]);
    expect(res.replies[0]).toMatchObject({ method: "sendDocument", caption: "123", chat_id: 1 });
    expect(res.replies[0]?.params.document).toEqual({ filename: "r.txt", size: 2 });
  });

  it("403 'blocked by the user' marks the user as blocked (spec §28.4)", async () => {
    bot = await createTestBot({
      setup: (app) => {
        app.command("start", async (ctx) => {
          await ctx.reply("salom");
        });
      },
    });
    bot.api.mock("sendMessage", { error: { error_code: 403, description: "Forbidden: bot was blocked by the user" } });

    const res = await bot.command("start");

    expect(res.error).toBeDefined();
    expect(res.replies).toHaveLength(0);
    expect(await bot.db?.users.findById(1)).toMatchObject({ status: "blocked" });
  });

  it("429 is retried after retry_after without real waiting (spec §28.4)", async () => {
    bot = await createTestBot({
      setup: (app) => {
        app.command("start", async (ctx) => {
          await ctx.reply("salom");
        });
      },
    });
    bot.api.mock("sendMessage", { error: { error_code: 429, parameters: { retry_after: 3 } } });
    const startedAt = bot.clock.now();

    const res = await bot.command("start");

    expect(res.apiCalls.filter((c) => c.method === "sendMessage")).toHaveLength(2);
    expect(res.apiCalls[0]).toMatchObject({ ok: false, error: { error_code: 429, description: "Too Many Requests" } });
    expect(res).toHaveRepliedWith("salom");
    expect(bot.clock.now() - startedAt).toBe(3000);
    expect(res.duration).toBeLessThan(2000);
  });

  it("function mocks, `times` and unknown error codes", async () => {
    bot = await createTestBot({
      setup: (app) => {
        app.command("me", async (ctx) => {
          const me = await ctx.api.getMe();
          await ctx.reply(me.first_name);
        });
      },
    });
    bot.api.mock("getMe", () => ({ result: { id: 5, is_bot: true, first_name: "Mocked" } }), { times: 2 });

    expect(await bot.command("me")).toHaveRepliedWith("Mocked");
    expect(await bot.command("me")).toHaveRepliedWith("Mocked");
    expect(await bot.command("me")).toHaveRepliedWith("TestBot");

    bot.api.mock("sendMessage", { error: { error_code: 418 } });
    const res = await bot.command("me");
    expect(res.apiCalls.at(-1)?.error).toEqual({ error_code: 418, description: "Error" });
  });

  it("registerFile() backs getFile + ctx.download()", async () => {
    let downloaded = "";
    bot = await createTestBot({
      setup: (app) => {
        app.event("message:document", async (ctx) => {
          const file = await ctx.download(ctx.message!.document!.file_id);
          downloaded = (await file.buffer()).toString("utf8");
        });
      },
    });
    bot.api.registerFile("doc-1", "fayl ichidagi matn");

    const res = await bot.document({ file_id: "doc-1", file_name: "a.txt" });

    expect(res.error).toBeUndefined();
    expect(res).toHaveCalledApi("getFile");
    expect(downloaded).toBe("fayl ichidagi matn");
  });

  it("an unregistered file download fails the handler", async () => {
    bot = await createTestBot({
      setup: (app) => {
        app.event("message:document", async (ctx) => {
          await ctx.download(ctx.message!.document!.file_id);
        });
      },
    });

    const res = await bot.document({ file_id: "missing" });

    expect(res.error).toBeDefined();
  });
});

describe("createTestBot — locale keys, clock and reset", () => {
  let bot: TestBot;
  afterEach(async () => {
    await bot.close();
  });

  it("toHaveRepliedWithKey passes regardless of the rendered language", async () => {
    for (const locale of ["uz", "ru"]) {
      bot = await createTestBot({
        locale,
        setup: async (app) => {
          await loadLocales(app, { cwd: path.join(here, "fixtures"), dir: "locales", defaultLocale: "uz" });
          app.command("start", async (ctx) => {
            await ctx.reply(ctx.t("bot.start", { name: ctx.from?.first_name }));
          });
        },
      });

      const res = await bot.command("start");

      expect(res).toHaveRepliedWithKey("bot.start");
      expect(res).not.toHaveRepliedWithKey("bot.other");
      expect(res.translations[0]?.params).toEqual({ name: "Test" });
      await bot.close();
    }
    bot = await createTestBot(); // for afterEach
  });

  it("toHaveRepliedWithKey explains when the key was translated but not sent", async () => {
    bot = await createTestBot({
      setup: (app) => {
        app.command("start", async (ctx) => {
          ctx.t("bot.hidden");
          await ctx.reply("boshqa matn");
        });
      },
    });

    const res = await bot.command("start");

    expect(() => expect(res).toHaveRepliedWithKey("bot.hidden")).toThrow(/javoblarda topilmadi/);
    expect(() => expect(res).toHaveRepliedWithKey("bot.none")).toThrow(/umuman chaqirilmadi/);
  });

  it("bot.clock starts at the real current time and advance() accepts spec durations", async () => {
    const before = Date.now();
    bot = await createTestBot({ autoAdvance: false });
    const start = bot.clock.now();
    expect(start).toBeGreaterThanOrEqual(before);
    expect(start).toBeLessThanOrEqual(Date.now());

    let woke = false;
    void bot.clock.sleep(5 * 60_000).then(() => {
      woke = true;
    });
    await bot.clock.advance("4m");
    expect(woke).toBe(false);
    await bot.clock.advance("1m");
    expect(woke).toBe(true);
    expect(bot.clock.now() - start).toBe(5 * 60_000);
  });

  it("reset() clears mocks and every table but keeps migrations", async () => {
    bot = await createTestBot({
      config: { app: { name: "custom-name" } },
      setup: (app) => {
        app.command("start", async (ctx) => {
          await ctx.reply(app.config.app.name);
        });
      },
    });
    await bot.command("start");
    bot.api.mock("sendMessage", { error: { error_code: 400 } }, { times: Infinity });
    expect(await bot.db?.users.count()).toBe(1);

    await bot.reset();

    expect(await bot.db?.users.count()).toBe(0);
    expect(bot.api.calls).toHaveLength(0);
    const res = await bot.command("start");
    expect(res).toHaveRepliedWith("custom-name");
    expect(await bot.db?.users.count()).toBe(1);
  });

  it("reset() without a database only clears the fake API", async () => {
    bot = await createTestBot({ database: "none" });
    bot.api.mock("sendMessage", { result: true });

    await bot.reset();

    expect(bot.api.calls).toHaveLength(0);
  });
});
