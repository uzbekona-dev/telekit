import { bodyOf, buttonsOf, type TestResult } from "./result.js";

interface MatcherContext {
  isNot: boolean;
}

interface MatcherResult {
  pass: boolean;
  message: () => string;
}

type TextPattern = string | RegExp;

function assertTestResult(received: unknown): asserts received is TestResult {
  const ok = typeof received === "object" && received !== null && Array.isArray((received as TestResult).replies);
  if (!ok) throw new TypeError("Telekit matcher'lari createTestBot() natijasini (TestResult) kutadi");
}

function matchesPattern(text: string, pattern: TextPattern): boolean {
  return typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);
}

function describeReplies(res: TestResult): string {
  if (res.replies.length === 0) return "hech qanday javob yuborilmagan";
  return res.replies.map((r, i) => `  [${i}] ${r.method}: ${JSON.stringify(bodyOf(r))}`).join("\n");
}

function result(ctx: MatcherContext, pass: boolean, positive: string, negative: string): MatcherResult {
  return { pass, message: () => (ctx.isNot ? negative : positive) };
}

/** Spec §28.3 assertions — registered on `expect` by `@telekit/testing/vitest-setup`, or manually via `expect.extend(telekitMatchers)`. */
export const telekitMatchers = {
  toHaveReplied(this: MatcherContext, received: unknown): MatcherResult {
    assertTestResult(received);
    const pass = received.replies.length > 0;
    return result(this, pass, "Bot javob yubormadi", `Bot javob yubormasligi kutilgan edi, lekin:\n${describeReplies(received)}`);
  },

  toHaveRepliedWith(this: MatcherContext, received: unknown, pattern: TextPattern): MatcherResult {
    assertTestResult(received);
    const pass = received.replies.some((r) => matchesPattern(bodyOf(r), pattern));
    return result(
      this,
      pass,
      `${String(pattern)} ga mos javob topilmadi. Yuborilganlar:\n${describeReplies(received)}`,
      `${String(pattern)} ga mos javob kutilmagan edi, lekin yuborildi`,
    );
  },

  /** Locale-independent: passes if some reply contains the text `ctx.t(key)` produced during this update (spec §28.3). */
  toHaveRepliedWithKey(this: MatcherContext, received: unknown, key: string): MatcherResult {
    assertTestResult(received);
    const rendered = received.translations.filter((t) => t.key === key).map((t) => t.text);
    const pass = rendered.some((text) => received.replies.some((r) => bodyOf(r).includes(text)));
    const why =
      rendered.length === 0
        ? `ctx.t("${key}") umuman chaqirilmadi`
        : `ctx.t("${key}") matni javoblarda topilmadi. Yuborilganlar:\n${describeReplies(received)}`;
    return result(this, pass, why, `"${key}" kaliti bilan javob kutilmagan edi, lekin yuborildi`);
  },

  /** Looks through inline and reply keyboards of every reply and edit. */
  toHaveButton(this: MatcherContext, received: unknown, label: TextPattern): MatcherResult {
    assertTestResult(received);
    const labels = [...received.replies, ...received.edits].flatMap(buttonsOf).map((b) => b.text);
    const pass = labels.some((text) => (typeof label === "string" ? text === label : label.test(text)));
    return result(
      this,
      pass,
      `"${String(label)}" tugmasi topilmadi. Mavjud tugmalar: ${JSON.stringify(labels)}`,
      `"${String(label)}" tugmasi kutilmagan edi, lekin bor`,
    );
  },

  toHaveCalledApi(this: MatcherContext, received: unknown, method: string): MatcherResult {
    assertTestResult(received);
    const pass = received.apiCalls.some((c) => c.method === method);
    const called = [...new Set(received.apiCalls.map((c) => c.method))];
    return result(
      this,
      pass,
      `${method} chaqirilmadi. Chaqirilganlar: ${JSON.stringify(called)}`,
      `${method} chaqirilmasligi kutilgan edi`,
    );
  },

  toHaveAnsweredCallback(this: MatcherContext, received: unknown): MatcherResult {
    assertTestResult(received);
    const pass = received.answeredCallback !== undefined;
    return result(this, pass, "answerCallbackQuery chaqirilmadi", "answerCallbackQuery chaqirilmasligi kutilgan edi");
  },

  /** The inline query was answered — with exactly `count` results, if given. */
  toHaveAnsweredInline(this: MatcherContext, received: unknown, count?: number): MatcherResult {
    assertTestResult(received);
    const actual = received.inlineAnswer?.results.length;
    const pass = actual !== undefined && (count === undefined || actual === count);
    const positive =
      actual === undefined ? "answerInlineQuery chaqirilmadi" : `${count} ta inline natija kutilgan edi, ${actual} ta yuborildi`;
    return result(this, pass, positive, "Inline so'rovga javob berilmasligi kutilgan edi");
  },
};

export interface TelekitMatchers<R = unknown> {
  toHaveReplied(): R;
  toHaveRepliedWith(pattern: string | RegExp): R;
  toHaveRepliedWithKey(key: string): R;
  toHaveButton(label: string | RegExp): R;
  toHaveCalledApi(method: string): R;
  toHaveAnsweredCallback(): R;
  toHaveAnsweredInline(count?: number): R;
}
