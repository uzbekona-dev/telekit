import type { Location, UploadableFile } from "@telekit/core";
import type { DocumentOptions, PhotoOptions, TestActor } from "./actor.js";
import {
  bodyOf,
  buttonsOf,
  messagesInOrder,
  type ConversationOutcome,
  type SentMessage,
  type TestResult,
  type TranslationCall,
} from "./result.js";
import type { ContactInput, DocumentInput, PhotoInput } from "./updates.js";

export interface ConversationHarnessOptions {
  /** Forwarded to `ctx.enter(name, params)`. */
  params?: unknown;
}

/** A literal text, a regular expression, or a locale key — keys resolve to whatever `ctx.t(key)` rendered during that step. */
type Expected = string | RegExp;
type MatchMode = "contains" | "exact";

function describeExpected(expected: Expected): string {
  return typeof expected === "string" ? JSON.stringify(expected) : String(expected);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Matches `text` against a regex, the rendered text(s) of a locale key, or — if no such key was rendered — the literal string. */
function textMatches(text: string, expected: Expected, translations: TranslationCall[], mode: MatchMode): boolean {
  if (expected instanceof RegExp) return expected.test(text);
  const rendered = translations.filter((t) => t.key === expected).map((t) => t.text);
  const candidates = rendered.length > 0 ? rendered : [expected];
  return candidates.some((candidate) => (mode === "exact" ? text === candidate : text.includes(candidate)));
}

/**
 * Step-by-step driver for a `defineConversation` dialog (spec §25.4):
 *
 * ```ts
 * const flow = bot.conversation("register");
 * await flow.expectPrompt("register.ask_name");
 * await flow.send("Xojisaid");
 * await flow.tapButton("common.yes");
 * expect(flow.finished).toBe(true);
 * ```
 *
 * Needs `installConversations(...)` in `createTestBot({ setup })`. Entering
 * sends `/<name>` as the user, but routing is replaced by `ctx.enter(name)`,
 * so no command handler is required. Every step throws if the pipeline
 * threw, so a broken conversation fails the test at the step that broke it.
 */
export class ConversationHarness {
  private readonly steps: TestResult[] = [];
  private starting?: Promise<TestResult>;
  private outcome?: ConversationOutcome;

  constructor(
    private readonly actor: TestActor,
    readonly name: string,
    private readonly options: ConversationHarnessOptions = {},
  ) {}

  /** Every step's result, oldest first — the entering update included. */
  get results(): readonly TestResult[] {
    return this.steps;
  }

  get lastResult(): TestResult | undefined {
    return this.steps.at(-1);
  }

  /** The conversation now driving this chat — differs from `name` after a `flow.goto()`. */
  get current(): string | undefined {
    return this.outcome?.name;
  }

  /** `"active"` while waiting for an answer; `"done"`, `"cancelled"` or `"timeout"` once it ended. `undefined` before it started. */
  get status(): string | undefined {
    return this.outcome?.status;
  }

  get finished(): boolean {
    return this.outcome !== undefined && this.outcome.status !== "active";
  }

  /** Enters the conversation. Idempotent — every other method calls it first. */
  start(): Promise<TestResult> {
    this.starting ??= this.enter();
    return this.starting;
  }

  /** The last message the bot sent (or edited) in the latest step must match — i.e. what it is asking right now. */
  async expectPrompt(expected: Expected): Promise<void> {
    const last = await this.latest();
    const prompt = messagesInOrder(last).at(-1);
    if (!prompt) {
      throw new Error(`"${this.name}": oxirgi qadamda bot hech narsa yubormadi — kutilgan savol: ${describeExpected(expected)}`);
    }
    if (!textMatches(bodyOf(prompt), expected, last.translations, "contains")) {
      throw new Error(`Kutilgan savol: ${describeExpected(expected)}\nBot so'radi:   ${JSON.stringify(bodyOf(prompt))}`);
    }
  }

  /** Any message the bot sent (or edited) in the latest step must match. */
  async expectReply(expected: Expected): Promise<void> {
    const last = await this.latest();
    const texts = messagesInOrder(last).map(bodyOf);
    if (!texts.some((text) => textMatches(text, expected, last.translations, "contains"))) {
      throw new Error(`Kutilgan javob: ${describeExpected(expected)}\nBot yubordi:   ${JSON.stringify(texts)}`);
    }
  }

  send(text: string): Promise<TestResult> {
    return this.step(() => this.actor.message(text));
  }

  sendContact(contact: string | ContactInput): Promise<TestResult> {
    const input = typeof contact === "string" ? { phone_number: contact } : contact;
    return this.step(() => this.actor.contact(input));
  }

  sendLocation(location: Location): Promise<TestResult> {
    return this.step(() => this.actor.location(location));
  }

  sendPhoto(input?: PhotoInput | UploadableFile, options?: PhotoOptions): Promise<TestResult> {
    return this.step(() => this.actor.photo(input, options));
  }

  sendDocument(input?: DocumentInput | UploadableFile, options?: DocumentOptions): Promise<TestResult> {
    return this.step(() => this.actor.document(input, options));
  }

  /**
   * Presses the newest button whose label matches exactly (or matches the
   * regex, or equals what `ctx.t(label)` rendered). Inline buttons send their
   * `callback_data` against the message that carried them; reply-keyboard
   * buttons send their label as text, like a real client.
   */
  async tapButton(label: Expected): Promise<TestResult> {
    await this.start();
    const found = this.findButton(label);
    if (!found) {
      const available = this.steps.flatMap((r) => messagesInOrder(r)).flatMap(buttonsOf).map((b) => b.text);
      throw new Error(`${describeExpected(label)} tugmasi topilmadi. Mavjud tugmalar: ${JSON.stringify(available)}`);
    }

    const { button, message } = found;
    if ("callback_data" in button && button.callback_data !== undefined) {
      const data = button.callback_data;
      return this.step(() => this.actor.callbackRaw(data, { messageId: message.message_id }));
    }
    if ("url" in button && button.url) {
      throw new Error(`"${button.text}" — URL tugma (${button.url}); uni bosish botga update yubormaydi`);
    }
    if ("request_contact" in button && button.request_contact) {
      throw new Error(`"${button.text}" kontakt so'raydi — o'rniga flow.sendContact(...) dan foydalaning`);
    }
    if ("request_location" in button && button.request_location) {
      throw new Error(`"${button.text}" joylashuv so'raydi — o'rniga flow.sendLocation(...) dan foydalaning`);
    }
    const text = button.text;
    return this.step(() => this.actor.message(text));
  }

  private findButton(label: Expected): { button: ReturnType<typeof buttonsOf>[number]; message: SentMessage } | undefined {
    for (const result of [...this.steps].reverse()) {
      for (const message of messagesInOrder(result).reverse()) {
        const button = buttonsOf(message).find((b) => textMatches(b.text, label, result.translations, "exact"));
        if (button) return { button, message };
      }
    }
    return undefined;
  }

  private async latest(): Promise<TestResult> {
    await this.start();
    return this.steps.at(-1)!;
  }

  private async step(action: () => Promise<TestResult>): Promise<TestResult> {
    await this.start();
    if (this.finished) {
      throw new Error(`"${this.current}" conversation allaqachon tugagan (holat: ${this.status}) — yangi xabar unga yetib bormaydi`);
    }
    return this.record(await action());
  }

  private record(result: TestResult): TestResult {
    this.steps.push(result);
    if (result.conversation) this.outcome = result.conversation;
    if (result.error !== undefined) {
      throw new Error(`"${this.current ?? this.name}" conversation xato berdi: ${describeError(result.error)}`, { cause: result.error });
    }
    return result;
  }

  private async enter(): Promise<TestResult> {
    const { result, probeRan } = await this.actor.runProbe(`/${this.name}`, async (ctx) => {
      const enter = (ctx as { enter?: (name: string, params?: unknown) => Promise<void> }).enter;
      if (!enter) {
        throw new Error("ctx.enter() mavjud emas — createTestBot({ setup }) ichida app.use(installConversations(...)) bormi?");
      }
      await enter(this.name, this.options.params);
    });

    if (!probeRan) {
      this.steps.push(result);
      if (result.conversation) this.outcome = result.conversation;
      throw new Error(
        `"${this.name}" boshlanmadi: update routing'ga yetmadi — middleware uni to'xtatdi` +
          (result.conversation ? ` (bu chatda "${result.conversation.name}" conversation allaqachon faol)` : ""),
      );
    }
    return this.record(result);
  }
}
