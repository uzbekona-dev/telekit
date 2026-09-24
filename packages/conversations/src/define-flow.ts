import type { Contact, Context, Document, Location, PhotoSize } from "@telekit/core";
import type { ValidateResult } from "./ask-options.js";
import { defineConversation, type ConversationDefinition, type ConversationOptions } from "./define-conversation.js";
import { FlowDefinitionError } from "./errors.js";
import type { FlowController } from "./flow.js";

/**
 * Text shown to the user: a locale key, rendered with `ctx.t(key, answers)`
 * (so `"feedback.thanks"` can say `{name}`), or `{ text }` sent as-is.
 */
export type FlowText = string | { text: string };

export type FlowValue = string | number | boolean;

export interface ChoiceExpect {
  kind: "choice";
  options: Array<{ value: FlowValue; label: FlowText }>;
}

export interface ConfirmExpect {
  kind: "confirm";
  yes?: FlowText;
  no?: FlowText;
}

export type FlowExpect = "text" | "number" | "contact" | "location" | "photo" | "document" | ChoiceExpect | ConfirmExpect;

/** Everything answered so far, by step id. A skipped optional step is `null`. */
export type FlowAnswers = Record<string, unknown>;

/** A `run` step's side effect — runs once (memoized like `flow.external`) with a frozen snapshot of the answers; its return value becomes `answers[stepId]` and must be JSON-serializable. */
export type FlowAction = (answers: FlowAnswers, ctx: Context) => unknown;

/**
 * Where to go next: a step id, `null` to finish, a branch table keyed by the
 * answer (`String(answer)`, with `"*"` as the fallback), or a function.
 */
export type FlowNext = string | null | Record<string, string | null> | ((answer: unknown, answers: FlowAnswers) => string | null);

interface AskStepBase {
  ask: FlowText;
  /** Adds a skip button; skipping records `null`. */
  optional?: boolean;
  /** Extra attempts after the first invalid answer before the flow gives up. */
  retry?: number;
  invalid?: FlowText;
  next: FlowNext;
}

type Validator<T> = (value: T) => ValidateResult;

/** `photo`/`document` limits (spec §27.4). */
interface MediaLimits {
  maxSize?: string | number;
  mimeTypes?: string[];
}

/** One member per `expect`, so `validate` gets the answer's real type (a number for `"number"`, a `Contact` for `"contact"`, ...). */
export type AskStep = AskStepBase &
  (
    | { expect: "text"; validate?: Validator<string> }
    | { expect: "number"; min?: number; max?: number; validate?: Validator<number> }
    | { expect: "contact"; validate?: Validator<Contact> }
    | { expect: "location"; validate?: Validator<Location> }
    | ({ expect: "photo"; validate?: Validator<PhotoSize[]> } & MediaLimits)
    | ({ expect: "document"; validate?: Validator<Document> } & MediaLimits)
    | { expect: ChoiceExpect | ConfirmExpect }
  );

export interface ReplyStep {
  reply: FlowText;
  next: FlowNext;
}

export interface RunStep {
  /** A key of `options.actions` (keeps the spec serializable, e.g. for a visual builder) or the function itself. */
  run: string | FlowAction;
  next: FlowNext;
}

export type FlowStep = AskStep | ReplyStep | RunStep;

export interface FlowSpec {
  start: string;
  steps: Record<string, FlowStep>;
}

export interface DefineFlowOptions extends ConversationOptions {
  actions?: Record<string, FlowAction>;
  /** Label of the skip button on `optional` steps. */
  skipLabel?: FlowText;
}

const EXPECT_KINDS = new Set(["text", "number", "contact", "location", "photo", "document"]);
const DEFAULT_SKIP_LABEL: FlowText = { text: "⏭ O'tkazib yuborish" };

/** `choice([1, 2, 3])` or `choice([{ value: "tsh", label: "cities.tashkent" }])` — primitive values label themselves. */
export function choice(values: ReadonlyArray<FlowValue | { value: FlowValue; label: FlowText }>): ChoiceExpect {
  return {
    kind: "choice",
    options: values.map((v) => (typeof v === "object" ? v : { value: v, label: { text: String(v) } })),
  };
}

/** A yes/no question; the answer is `true`/`false`, so branch tables use the keys `"true"`/`"false"`. */
export function confirm(labels: { yes?: FlowText; no?: FlowText } = {}): ConfirmExpect {
  return { kind: "confirm", ...labels };
}

function kindOf(step: FlowStep): "ask" | "reply" | "run" {
  const kinds = (["ask", "reply", "run"] as const).filter((k) => k in step);
  if (kinds.length !== 1) throw new Error(kinds.length === 0 ? "ask, reply yoki run bo'lishi kerak" : `faqat bittasi bo'lishi mumkin: ${kinds.join(", ")}`);
  return kinds[0]!;
}

/** Branch keys a step's answer can produce, when they are known up front. */
function answerKeys(step: FlowStep): string[] | null {
  if (!("ask" in step) || typeof step.expect === "string") return null;
  return step.expect.kind === "confirm" ? ["true", "false"] : step.expect.options.map((o) => String(o.value));
}

function validateKind(step: FlowStep, options: DefineFlowOptions): void {
  const kind = kindOf(step);
  if (kind === "run" && "run" in step && typeof step.run === "string" && !options.actions?.[step.run]) {
    throw new Error(`"${step.run}" action'i options.actions ichida yo'q`);
  }
  if (kind !== "ask" || !("ask" in step)) return;
  if (typeof step.expect === "string" && !EXPECT_KINDS.has(step.expect)) throw new Error(`noma'lum expect: "${step.expect}"`);
  if (typeof step.expect === "object" && step.expect.kind === "choice" && step.expect.options.length === 0) {
    throw new Error("choice() kamida bitta variant talab qiladi");
  }
}

function validateStep(step: FlowStep, spec: FlowSpec, options: DefineFlowOptions): void {
  validateKind(step, options);

  const next = step.next;
  if (typeof next === "string" && !spec.steps[next]) throw new Error(`next → "${next}" qadami yo'q`);
  if (next !== null && typeof next === "object") {
    for (const target of Object.values(next)) {
      if (target !== null && !spec.steps[target]) throw new Error(`next → "${target}" qadami yo'q`);
    }
    if ("*" in next) return;
    // Free text, numbers, media and action results can't be enumerated: without a "*" route, any
    // unlisted answer would fail the turn and leave the user stuck on this step for good.
    const keys = answerKeys(step);
    if (keys === null) throw new Error('next jadvali javoblari oldindan ma\'lum bo\'lmagan qadamda "*" yo\'lini talab qiladi');
    const missing = keys.filter((key) => !(key in next));
    if (missing.length > 0) throw new Error(`next jadvalida ${missing.map((k) => `"${k}"`).join(", ")} javob(lar)i uchun yo'l ham, "*" ham yo'q`);
  }
}

function validateSpec(name: string, spec: FlowSpec, options: DefineFlowOptions): void {
  if (!spec.steps[spec.start]) throw new FlowDefinitionError(name, `start → "${spec.start}" qadami yo'q`);
  for (const [id, step] of Object.entries(spec.steps)) {
    try {
      validateStep(step, spec, options);
    } catch (err) {
      throw new FlowDefinitionError(name, `"${id}" qadami: ${(err as Error).message}`);
    }
  }
}

function resolveNext(name: string, id: string, next: FlowNext, answer: unknown, answers: FlowAnswers): string | null {
  if (typeof next === "function") return next(answer, answers);
  if (next === null || typeof next === "string") return next;
  const key = String(answer);
  if (key in next) return next[key]!;
  if ("*" in next) return next["*"]!;
  throw new FlowDefinitionError(name, `"${id}" qadami: "${key}" javobi uchun next jadvalida yo'l yo'q`);
}

/**
 * Every step id is a message variable — `""` until (or unless) that step is
 * answered, so a template shared by several branches (`{comment}` after a
 * path that skipped `comment`) never hits ICU's "value not provided" error.
 * Contacts render as their phone number; other objects as `""` — ICU would
 * otherwise print "[object Object]".
 */
function messageParams(stepIds: readonly string[], answers: FlowAnswers): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const id of stepIds) {
    const value = answers[id];
    if (value === null || value === undefined) params[id] = "";
    else if (typeof value !== "object") params[id] = value;
    else params[id] = (value as { phone_number?: unknown }).phone_number ?? "";
  }
  return params;
}

type EnumerableAsk = AskStep & { expect: ChoiceExpect | ConfirmExpect };

function isEnumerable(step: AskStep): step is EnumerableAsk {
  return typeof step.expect === "object";
}

function askEnumerable(flow: FlowController, step: EnumerableAsk, prompt: string, render: (text: FlowText) => string): Promise<unknown> {
  const expect = step.expect;
  if (expect.kind === "choice") {
    return flow.choice(prompt, expect.options.map((o) => ({ value: o.value, label: render(o.label) })));
  }
  return flow.confirm(prompt, {
    ...(expect.yes !== undefined ? { yesLabel: render(expect.yes) } : {}),
    ...(expect.no !== undefined ? { noLabel: render(expect.no) } : {}),
  });
}

function ask(flow: FlowController, step: AskStep, render: (text: FlowText) => string): Promise<unknown> {
  const prompt = render(step.ask);
  if (isEnumerable(step)) return askEnumerable(flow, step, prompt, render);

  const common = { retry: step.retry, invalidMessage: step.invalid === undefined ? undefined : render(step.invalid) };
  switch (step.expect) {
    case "number":
      return flow.number(prompt, { ...common, validate: step.validate, min: step.min, max: step.max });
    case "contact":
      return flow.contact(prompt, { ...common, validate: step.validate });
    case "location":
      return flow.location(prompt, { ...common, validate: step.validate });
    case "photo":
      return flow.photo(prompt, { ...common, validate: step.validate, maxSize: step.maxSize, mimeTypes: step.mimeTypes });
    case "document":
      return flow.document(prompt, { ...common, validate: step.validate, maxSize: step.maxSize, mimeTypes: step.mimeTypes });
    case "text":
      return flow.text(prompt, { ...common, validate: step.validate });
  }
}

/**
 * Declarative conversations (spec §25.2): a step table interpreted on top of
 * the same replay engine as `defineConversation` — not a separate runtime —
 * so it gets persistence, timeouts, cancel commands and the test harness
 * for free. The spec is checked when defined, so a typo in a step id fails
 * at startup rather than halfway through a user's dialog.
 *
 * ```ts
 * export default defineFlow("feedback", {
 *   start: "rating",
 *   steps: {
 *     rating:  { ask: "feedback.rating", expect: choice([1, 2, 3, 4, 5]), next: "comment" },
 *     comment: { ask: "feedback.comment", expect: "text", optional: true, next: "save" },
 *     save:    { run: "feedback.save", next: "thanks" },
 *     thanks:  { reply: "feedback.thanks", next: null },
 *   },
 * }, { actions: { "feedback.save": (answers, ctx) => saveFeedback(ctx.user, answers) } });
 * ```
 */
export function defineFlow(name: string, spec: FlowSpec, options: DefineFlowOptions = {}): ConversationDefinition {
  validateSpec(name, spec, options);
  const { actions = {}, skipLabel = DEFAULT_SKIP_LABEL, ...conversationOptions } = options;
  const stepIds = Object.keys(spec.steps);

  return defineConversation(
    name,
    async (flow, ctx) => {
      const answers: FlowAnswers = {};
      const render = (text: FlowText) => (typeof text === "string" ? ctx.t(text, messageParams(stepIds, answers)) : text.text);
      let current: string | null = spec.start;
      let stepsWithoutAsking = 0;

      while (current !== null) {
        const id: string = current;
        const step: FlowStep = spec.steps[id]!;
        if ("ask" in step) {
          stepsWithoutAsking = 0;
          answers[id] = step.optional ? await flow.optional(render(skipLabel), () => ask(flow, step, render)) : await ask(flow, step, render);
        } else if (++stepsWithoutAsking > stepIds.length) {
          throw new FlowDefinitionError(name, `"${id}" qadamida hech narsa so'ramaydigan cheksiz aylanish`);
        } else if ("reply" in step) {
          await flow.reply(render(step.reply));
        } else {
          const action = typeof step.run === "string" ? actions[step.run]! : step.run;
          answers[id] = await flow.external(`run:${id}`, () => action(Object.freeze({ ...answers }), ctx));
        }

        const next = resolveNext(name, id, step.next, answers[id], Object.freeze({ ...answers }));
        if (next !== null && !spec.steps[next]) throw new FlowDefinitionError(name, `"${id}" qadami: next → "${next}" qadami yo'q`);
        current = next;
      }
    },
    conversationOptions,
  );
}
