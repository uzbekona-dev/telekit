import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  choice,
  confirm,
  createConversationsMigrationProvider,
  DatabaseConversationStore,
  defineFlow,
  installConversations,
  type ConversationDefinition,
  type FlowAnswers,
} from "@telekit/conversations";
import { loadLocales } from "@telekit/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestBot, type TestBot } from "../src/index.js";
import "../src/vitest-setup.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

async function flowBot(definitions: ConversationDefinition[]): Promise<TestBot> {
  return createTestBot({
    config: { database: { migrations: { providers: [createConversationsMigrationProvider] } } },
    setup: async (app, bot) => {
      await loadLocales(app, { cwd: fixtures, dir: "locales", defaultLocale: "uz" });
      app.use(installConversations(definitions, { store: new DatabaseConversationStore(app.db!), clock: bot.clock }));
    },
  });
}

/** Spec §25.2's example, plus a branch for low ratings. */
function feedbackFlow(save: (answers: FlowAnswers) => unknown): ConversationDefinition {
  return defineFlow(
    "feedback",
    {
      start: "rating",
      steps: {
        rating: { ask: "feedback.rating", expect: choice([1, 2, 3, 4, 5]), next: { "1": "low", "2": "low", "*": "comment" } },
        low: { ask: "feedback.low", expect: "text", next: "save" },
        comment: { ask: "feedback.comment", expect: "text", optional: true, next: "save" },
        save: { run: "feedback.save", next: "thanks" },
        thanks: { reply: "feedback.thanks", next: null },
      },
    },
    { actions: { "feedback.save": (answers) => save(answers) } },
  );
}

describe("defineFlow() through the conversation harness", () => {
  let bot: TestBot;
  afterEach(async () => {
    await bot.close();
  });

  it("walks the spec §25.2 feedback flow, running the save action exactly once", async () => {
    const save = vi.fn(() => ({ saved: true }));
    bot = await flowBot([feedbackFlow(save)]);
    const flow = bot.conversation("feedback");

    await flow.expectPrompt("feedback.rating");
    await flow.tapButton("5");
    await flow.expectPrompt("feedback.comment");
    await flow.send("Zo'r bot");

    expect(flow.finished).toBe(true);
    // ctx.t() HTML-escapes interpolated values (spec §16.3) — Telegram renders &#39; as '
    await flow.expectReply("Rahmat! Bahoyingiz: 5. Izoh: Zo&#39;r bot");
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ rating: 5, comment: "Zo'r bot" });
  });

  it("an optional step can be skipped with its button, recording null", async () => {
    const save = vi.fn();
    bot = await flowBot([feedbackFlow(save)]);
    const flow = bot.conversation("feedback");

    await flow.tapButton("4");
    await flow.tapButton("⏭ O'tkazib yuborish");

    await flow.expectReply("Rahmat! Bahoyingiz: 4. Izoh: ");
    expect(save).toHaveBeenCalledWith({ rating: 4, comment: null });
    expect(flow.lastResult).toHaveAnsweredCallback();
  });

  it("follows the branch table for low ratings", async () => {
    const save = vi.fn();
    bot = await flowBot([feedbackFlow(save)]);
    const flow = bot.conversation("feedback");

    await flow.tapButton("1");
    await flow.expectPrompt("feedback.low");
    await flow.send("Sekin ishlaydi");

    expect(save).toHaveBeenCalledWith({ rating: 1, low: "Sekin ishlaydi" });
    expect(flow.finished).toBe(true);
  });

  it("supports numbers with bounds, confirm branches, function next, inline actions and literal texts", async () => {
    const register = defineFlow(
      "register",
      {
        start: "age",
        steps: {
          age: { ask: { text: "Yoshingiz?" }, expect: "number", min: 14, max: 100, invalid: { text: "14–100 oralig'ida" }, next: "sure" },
          sure: { ask: { text: "Tasdiqlaysizmi?" }, expect: confirm({ yes: { text: "Ha" }, no: { text: "Yo'q" } }), next: { true: "code", false: "age" } },
          code: { run: (answers) => `U-${String(answers.age)}`, next: (_code, answers) => (Number(answers.age) >= 18 ? "adult" : "minor") },
          adult: { reply: { text: "Xush kelibsiz!" }, next: null },
          minor: { reply: { text: "Ota-onangiz bilan keling." }, next: null },
        },
      },
      {},
    );
    bot = await flowBot([register]);
    const flow = bot.conversation("register");

    await flow.send("7");
    await flow.expectReply("14–100 oralig'ida");
    await flow.send("16");
    await flow.tapButton("Yo'q");
    await flow.expectPrompt("Yoshingiz?");
    await flow.send("30");
    await flow.tapButton("Ha");

    await flow.expectReply("Xush kelibsiz!");
    expect(flow.finished).toBe(true);
  });

  it("collects contacts and documents, and renders a contact as its phone number", async () => {
    const collect = defineFlow("collect", {
      start: "phone",
      steps: {
        phone: { ask: { text: "Raqam?" }, expect: "contact", next: "where" },
        where: { ask: { text: "Qayerda?" }, expect: "location", next: "cv" },
        cv: { ask: { text: "CV?" }, expect: "document", mimeTypes: ["application/pdf"], next: "photo" },
        photo: { ask: { text: "Rasm?" }, expect: "photo", maxSize: "5MB", next: "done" },
        done: { reply: "feedback.contact_saved", next: null },
      },
    });
    bot = await flowBot([collect]);
    const flow = bot.conversation("collect");

    await flow.sendContact("+998901234567");
    await flow.sendLocation({ latitude: 41.3, longitude: 69.2 });
    await flow.sendDocument({ file_name: "cv.pdf", mime_type: "application/pdf", file_size: 100 });
    await flow.sendPhoto({ file_size: 100 });

    expect(flow.finished).toBe(true);
    await flow.expectReply("Raqam: +998901234567, joy: ");
  });

  it("routes free-text answers through a branch table, sending anything unlisted to '*'", async () => {
    const survey = defineFlow("survey", {
      start: "q",
      steps: {
        q: { ask: { text: "Davom etamizmi? (ha/yo'q)" }, expect: "text", next: { ha: "yes", "*": "other" } },
        yes: { reply: { text: "Zo'r!" }, next: null },
        other: { reply: { text: "Tushunarli." }, next: null },
      },
    });
    bot = await flowBot([survey]);

    const exact = bot.conversation("survey");
    await exact.send("ha");
    await exact.expectReply("Zo'r!");

    const unlisted = bot.as({ id: 2 }).conversation("survey");
    await unlisted.send("Ha ");
    await unlisted.expectReply("Tushunarli.");
    expect(unlisted.finished).toBe(true);
  });

  it("fails loudly on a loop that never asks, and on a function next naming a missing step", async () => {
    const looping = defineFlow("looping", {
      start: "a",
      steps: { a: { reply: { text: "a" }, next: "b" }, b: { run: () => 1, next: "a" } },
    });
    const badTarget = defineFlow("badTarget", {
      start: "q",
      steps: { q: { ask: { text: "?" }, expect: "text", next: () => "missing" } },
    });
    bot = await flowBot([looping, badTarget]);

    await expect(bot.conversation("looping").start()).rejects.toThrow(/cheksiz aylanish/);
    await expect(bot.as({ id: 3 }).conversation("badTarget").send("x")).rejects.toThrow(/next → "missing" qadami yo'q/);
  });
});
