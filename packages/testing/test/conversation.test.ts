import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createConversationsMigrationProvider,
  DatabaseConversationStore,
  defineConversation,
  installConversations,
  type ConversationDefinition,
} from "@telekit/conversations";
import { btn, keyboard, loadLocales, type Application } from "@telekit/core";
import { afterEach, describe, expect, it } from "vitest";
import { createTestBot, type TestBot } from "../src/index.js";
import "../src/vitest-setup.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

const CITIES = [
  { id: 1, name: "Toshkent" },
  { id: 2, name: "Samarqand" },
];

/** The spec §25.1 example, minus the parts the flow API doesn't have yet (reply keyboards, service container). */
function registerFlow(created: unknown[]): ConversationDefinition {
  return defineConversation(
    "register",
    async (flow, ctx) => {
      const name = await flow.text(ctx.t("register.ask_name"), {
        validate: (v) => v.trim().length >= 2 || ctx.t("register.name_too_short"),
      });
      const contact = await flow.contact(ctx.t("register.ask_phone"));
      const age = await flow.number(ctx.t("register.ask_age"), { min: 14, max: 100, invalidMessage: ctx.t("register.invalid_age") });
      const city = await flow.choice(
        ctx.t("register.ask_city"),
        CITIES.map((c) => ({ value: c, label: c.name })),
      );

      const confirmed = await flow.confirm(ctx.t("register.confirm", { name, age, city: city.name }), {
        yesLabel: ctx.t("common.yes"),
        noLabel: ctx.t("common.no"),
      });
      if (!confirmed) {
        await flow.reply(ctx.t("register.restarted"));
        return flow.restart();
      }

      await flow.external("create-user", () => {
        created.push({ name, phone: contact.phone_number, age, cityId: city.id });
        return true;
      });
      await flow.reply(ctx.t("register.done", { name }));
    },
    {
      cancelCommands: ["/cancel"],
      timeout: "30m",
      onCancel: async (flow) => flow.reply("register.cancelled"),
      onTimeout: async (flow) => flow.reply("register.timeout"),
    },
  );
}

async function conversationBot(
  definitions: ConversationDefinition[],
  extra: (app: Application) => void = () => {},
): Promise<TestBot> {
  return createTestBot({
    config: { database: { migrations: { providers: [createConversationsMigrationProvider] } } },
    setup: async (app, bot) => {
      await loadLocales(app, { cwd: fixtures, dir: "locales", defaultLocale: "uz" });
      app.use(installConversations(definitions, { store: new DatabaseConversationStore(app.db!), clock: bot.clock }));
      extra(app);
    },
  });
}

describe("bot.conversation() — spec §25.4 harness", () => {
  let bot: TestBot;
  afterEach(async () => {
    await bot.close();
  });

  it("walks the spec §25.4 register dialog end to end", async () => {
    const created: unknown[] = [];
    bot = await conversationBot([registerFlow(created)]);

    const flow = bot.conversation("register");
    expect(flow.finished).toBe(false);
    expect(flow.status).toBeUndefined();

    await flow.expectPrompt("register.ask_name");
    await flow.send("Xojisaid");
    await flow.expectPrompt("register.ask_phone");
    await flow.sendContact("+998901234567");
    await flow.send("25");
    await flow.expectPrompt(/Shaharni/);
    await flow.tapButton("Toshkent");
    await flow.expectPrompt("Xojisaid, 25 yosh, Toshkent. To'g'rimi?");
    await flow.tapButton("common.yes");

    expect(flow.finished).toBe(true);
    expect(flow.status).toBe("done");
    expect(flow.current).toBe("register");
    await flow.expectReply("register.done");
    expect(created).toEqual([{ name: "Xojisaid", phone: "+998901234567", age: 25, cityId: 1 }]);
    expect(await bot.db?.users.count()).toBe(1);
    expect(flow.results).toHaveLength(6);
    expect(flow.lastResult).toHaveAnsweredCallback();
  });

  it("invalid answers are re-asked without advancing", async () => {
    bot = await conversationBot([registerFlow([])]);
    const flow = bot.conversation("register");

    await flow.send("X");
    await flow.expectReply("register.name_too_short");
    await flow.send("Ali");
    await flow.sendContact({ phone_number: "+998900000000", first_name: "Ali" });
    await flow.send("7");
    await flow.expectReply("register.invalid_age");
    await expect(flow.expectPrompt("register.ask_city")).rejects.toThrow(/Kutilgan savol/);
    await flow.send("30");
    await flow.expectPrompt("register.ask_city");

    expect(flow.status).toBe("active");
  });

  it("answering 'no' restarts the dialog from the first question", async () => {
    bot = await conversationBot([registerFlow([])]);
    const flow = bot.conversation("register");

    await flow.send("Ali");
    await flow.sendContact("+998901111111");
    await flow.send("40");
    await flow.tapButton("Samarqand");
    await flow.tapButton("common.no");

    await flow.expectReply("register.restarted");
    await flow.expectPrompt("register.ask_name");
    expect(flow.finished).toBe(false);
  });

  it("a cancel command ends it as cancelled, and later sends are rejected", async () => {
    bot = await conversationBot([registerFlow([])]);
    const flow = bot.conversation("register");

    await flow.send("Ali");
    await flow.send("/cancel");

    expect(flow.status).toBe("cancelled");
    expect(flow.finished).toBe(true);
    await flow.expectReply("register.cancelled");
    await expect(flow.send("yana")).rejects.toThrow(/allaqachon tugagan/);
  });

  it("bot.clock.advance() past the timeout expires it on the next update", async () => {
    bot = await conversationBot([registerFlow([])]);
    const flow = bot.conversation("register");
    await flow.start();

    await bot.clock.advance("29m");
    await flow.send("Ali");
    expect(flow.status).toBe("active");

    await bot.clock.advance("30m");
    await flow.sendContact("+998902222222");

    expect(flow.status).toBe("timeout");
    await flow.expectReply("register.timeout");
  });

  it("passes params to ctx.enter() and follows flow.goto() to the next conversation", async () => {
    const seenParams: unknown[] = [];
    const first = defineConversation("first", async (flow) => {
      const answer = await flow.text("Birinchi?");
      if (answer === "keyingi") flow.goto("second");
    });
    const second = defineConversation("second", async (flow) => {
      await flow.text("Ikkinchi?");
    });
    bot = await conversationBot([first, second], (app) => {
      app.use(async (ctx, next) => {
        const enter = ctx.enter;
        if (enter) {
          ctx.enter = (name, params) => {
            seenParams.push(params);
            return enter(name, params);
          };
        }
        await next();
      });
    });

    const flow = bot.conversation("first", { params: { source: "test" } });
    await flow.expectPrompt("Birinchi?");
    await flow.send("keyingi");

    expect(seenParams).toEqual([{ source: "test" }]);
    expect(flow.current).toBe("second");
    expect(flow.status).toBe("active");
    await flow.expectPrompt("Ikkinchi?");
  });

  it("each user in a chat gets their own conversation", async () => {
    bot = await conversationBot([registerFlow([])]);

    const ali = bot.conversation("register");
    const vali = bot.as({ id: 2, first_name: "Vali" }).conversation("register");
    await ali.send("Ali");
    await vali.expectPrompt("register.ask_name");
    await ali.expectPrompt("register.ask_phone");
  });

  it("refuses to start while another conversation is active for the same user", async () => {
    bot = await conversationBot([registerFlow([])]);
    await bot.conversation("register").start();

    const again = bot.conversation("register");

    await expect(again.start()).rejects.toThrow(/boshlanmadi.*"register" conversation allaqachon faol/);
    expect(again.results).toHaveLength(1);
  });

  it("explains a missing installConversations()", async () => {
    bot = await createTestBot();

    await expect(bot.conversation("register").expectPrompt("x")).rejects.toThrow(/installConversations/);
  });

  it("surfaces an error thrown inside the conversation at the failing step", async () => {
    const broken = defineConversation("broken", async (flow) => {
      await flow.text("Savol?");
      await flow.external("boom", () => {
        throw new Error("tashqi xizmat ishlamadi");
      });
    });
    bot = await conversationBot([broken]);
    const flow = bot.conversation("broken");

    await flow.start();

    await expect(flow.send("javob")).rejects.toThrow(/"broken" conversation xato berdi: tashqi xizmat ishlamadi/);
  });

  it("tapButton explains unusable or missing buttons and sends reply-keyboard labels as text", async () => {
    const menu = defineConversation("menu", async (flow) => {
      await flow.reply("Menyu", {
        reply_markup: {
          keyboard: [[{ text: "📞 Raqam", request_contact: true }, { text: "📍 Joy", request_location: true }], [{ text: "Davom" }]],
        },
      });
      await flow.reply("Havola", { reply_markup: keyboard().row(btn.url("Sayt", "https://example.com")) });
      const picked = await flow.text();
      await flow.reply(`Tanlandi: ${picked}`);
    });
    bot = await conversationBot([menu]);
    const flow = bot.conversation("menu");

    await expect(flow.tapButton("Yo'q tugma")).rejects.toThrow(/tugmasi topilmadi.*Davom/);
    await expect(flow.tapButton("Sayt")).rejects.toThrow(/URL tugma/);
    await expect(flow.tapButton("📞 Raqam")).rejects.toThrow(/sendContact/);
    await expect(flow.tapButton(/Joy/)).rejects.toThrow(/sendLocation/);

    await flow.tapButton("Davom");

    await flow.expectReply("Tanlandi: Davom");
    expect(flow.finished).toBe(true);
  });

  it("expectPrompt fails clearly when the bot sent nothing", async () => {
    const silent = defineConversation("silent", async (flow) => {
      await flow.wait();
    });
    bot = await conversationBot([silent]);

    await expect(bot.conversation("silent").expectPrompt("x")).rejects.toThrow(/hech narsa yubormadi/);
  });

  it("forwards media answers: location, photo and document fixtures", async () => {
    const media = defineConversation("media", async (flow) => {
      const where = await flow.location("Qayerdasiz?");
      const photo = await flow.photo("Rasm yuboring");
      const doc = await flow.document("Hujjat yuboring", { mimeTypes: ["text/plain"] });
      await flow.reply(`${where.latitude} ${photo.at(-1)?.file_size} ${doc.file_name} ${doc.mime_type}`);
    });
    bot = await conversationBot([media]);
    const flow = bot.conversation("media");
    const { InputFile } = await import("@telekit/core");

    await flow.sendLocation({ latitude: 41.3, longitude: 69.2 });
    await flow.sendPhoto({ file_size: 42 });
    await flow.sendDocument(InputFile.path(path.join(fixtures, "files", "hello.txt")));

    await flow.expectReply("41.3 42 hello.txt text/plain");
  });
});
