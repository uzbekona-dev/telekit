import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createConversationsMigrationProvider,
  DatabaseConversationStore,
  defineConversation,
  installConversations,
  type ConversationDefinition,
} from "@telekit/conversations";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestBot, type TestBot } from "../src/index.js";
import "../src/vitest-setup.js";

const QUESTIONS = Array.from({ length: 10 }, (_, i) => `Savol ${i + 1}?`);

/** One process's bot, backed by a SQLite *file* so a second instance can pick up where it stopped. */
function botOn(file: string, conversation: ConversationDefinition): Promise<TestBot> {
  return createTestBot({
    config: { database: { file, migrations: { providers: [createConversationsMigrationProvider] } } },
    setup: (app, bot) => {
      app.use(installConversations([conversation], { store: new DatabaseConversationStore(app.db!), clock: bot.clock }));
    },
  });
}

/**
 * Spec §44 v0.3 exit criteria:
 *   ✓ 10 qadamli dialog restart'dan keyin davom etadi
 *   ✓ flow.external replay'da qayta chaqirilmaydi
 *   ✓ ctx.reply conversation ichida xato beradi
 */
describe("v0.3 exit criteria", () => {
  let dir: string;
  const bots: TestBot[] = [];
  afterEach(async () => {
    await Promise.all(bots.splice(0).map((b) => b.close().catch(() => {})));
    rmSync(dir, { recursive: true, force: true });
  });

  it("a 10-step dialog survives a restart, and flow.external runs exactly once", async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "telekit-restart-"));
    const file = path.join(dir, "bot.sqlite");
    const createUser = vi.fn((answers: string[]) => ({ id: 1, answers: answers.length }));
    const survey = defineConversation("survey", async (flow) => {
      const answers: string[] = [];
      for (const question of QUESTIONS) answers.push(await flow.text(question));
      const created = await flow.external("create-user", () => createUser(answers));
      await flow.reply(`Tayyor: ${created.answers} ta javob — ${answers.join(",")}`);
    });

    // Process 1: enters and answers half of the questions, then shuts down.
    const first = await botOn(file, survey);
    bots.push(first);
    const flow = first.conversation("survey");
    for (let i = 1; i <= 5; i++) {
      await flow.expectPrompt(`Savol ${i}?`);
      await flow.send(`j${i}`);
    }
    await flow.expectPrompt("Savol 6?");
    await first.close();

    // Process 2: a fresh Application on the same database resumes at question 6.
    const second = await botOn(file, survey);
    bots.push(second);
    for (let i = 6; i <= 9; i++) {
      const res = await second.message(`j${i}`);
      expect(res.conversation).toEqual({ name: "survey", status: "active" });
      expect(res).toHaveRepliedWith(`Savol ${i + 1}?`);
    }
    const last = await second.message("j10");

    expect(last.conversation).toEqual({ name: "survey", status: "done" });
    expect(last).toHaveRepliedWith("Tayyor: 10 ta javob — j1,j2,j3,j4,j5,j6,j7,j8,j9,j10");
    expect(createUser).toHaveBeenCalledTimes(1); // the final turn replayed 10 asks, never the external
  });

  it("ctx.reply() inside a conversation body is rejected with TK2201", async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "telekit-guard-"));
    const direct = defineConversation("direct", async (_flow, ctx) => {
      await ctx.reply("to'g'ridan-to'g'ri");
    });
    const bot = await botOn(path.join(dir, "bot.sqlite"), direct);
    bots.push(bot);

    const error = (await bot.conversation("direct").start().catch((err: unknown) => err)) as Error;

    expect(error.message).toContain('"flow.reply()"');
    expect(error.cause).toMatchObject({ code: "TK2201" });
  });
});
