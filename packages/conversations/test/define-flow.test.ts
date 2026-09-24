import { describe, expect, it } from "vitest";
import { choice, confirm, defineFlow, type FlowSpec, type FlowStep } from "../src/define-flow.js";
import { FlowDefinitionError } from "../src/errors.js";

function definitionError(spec: FlowSpec, options?: Parameters<typeof defineFlow>[2]): string {
  try {
    defineFlow("demo", spec, options);
  } catch (err) {
    expect(err).toBeInstanceOf(FlowDefinitionError);
    expect((err as FlowDefinitionError).code).toBe("TK2206");
    return (err as Error).message;
  }
  throw new Error("defineFlow() did not throw");
}

describe("choice() / confirm()", () => {
  it("labels primitive values with themselves and keeps explicit labels", () => {
    expect(choice([1, "b", true])).toEqual({
      kind: "choice",
      options: [
        { value: 1, label: { text: "1" } },
        { value: "b", label: { text: "b" } },
        { value: true, label: { text: "true" } },
      ],
    });
    expect(choice([{ value: "tsh", label: "cities.tashkent" }]).options[0]).toEqual({ value: "tsh", label: "cities.tashkent" });
    expect(confirm()).toEqual({ kind: "confirm" });
    expect(confirm({ yes: "common.yes", no: { text: "Yo'q" } })).toEqual({ kind: "confirm", yes: "common.yes", no: { text: "Yo'q" } });
  });
});

describe("defineFlow() validates the spec up front", () => {
  it("returns a regular conversation definition, passing conversation options through", () => {
    const def = defineFlow("demo", { start: "a", steps: { a: { reply: { text: "Salom" }, next: null } } }, { cancelCommands: ["/stop"], timeout: "5m" });
    expect(def.name).toBe("demo");
    expect(def.options).toEqual({ cancelCommands: ["/stop"], timeout: "5m" });
  });

  it("rejects an unknown start or next step", () => {
    expect(definitionError({ start: "nope", steps: { a: { reply: "x", next: null } } })).toBe('defineFlow("demo"): start → "nope" qadami yo\'q');
    expect(definitionError({ start: "a", steps: { a: { reply: "x", next: "b" } } })).toMatch(/"a" qadami: next → "b" qadami yo'q/);
    expect(definitionError({ start: "a", steps: { a: { ask: "q", expect: confirm(), next: { true: "x", false: null } } } })).toMatch(
      /next → "x" qadami yo'q/,
    );
  });

  it("requires exactly one of ask / reply / run per step", () => {
    expect(definitionError({ start: "a", steps: { a: { next: null } as never } })).toMatch(/ask, reply yoki run bo'lishi kerak/);
    expect(definitionError({ start: "a", steps: { a: { reply: "x", run: () => 1, next: null } as never } })).toMatch(/faqat bittasi.*reply, run/);
  });

  it("requires named actions to exist, known expect kinds and non-empty choices", () => {
    expect(definitionError({ start: "a", steps: { a: { run: "save", next: null } } })).toMatch(/"save" action'i options.actions ichida yo'q/);
    expect(definitionError({ start: "a", steps: { a: { ask: "q", expect: "email" as never, next: null } } })).toMatch(/noma'lum expect: "email"/);
    expect(definitionError({ start: "a", steps: { a: { ask: "q", expect: choice([]), next: null } } })).toMatch(/kamida bitta variant/);
  });

  it("requires a branch table to cover every known answer, unless it has a '*' fallback", () => {
    const table = { ask: "q", expect: choice(["a", "b", "c"]), next: { a: null, b: null } };
    expect(definitionError({ start: "q", steps: { q: table } })).toMatch(/"c" javob\(lar\)i uchun yo'l ham, "\*" ham yo'q/);
    expect(() => defineFlow("demo", { start: "q", steps: { q: { ...table, next: { a: null, "*": null } } } })).not.toThrow();
    expect(definitionError({ start: "q", steps: { q: { ask: "q", expect: confirm(), next: { true: null } } } })).toMatch(/"false"/);
  });

  it("requires a '*' route when a step's answers can't be enumerated (text, numbers, media, actions)", () => {
    const table = { yes: null };
    for (const step of [
      { ask: "q", expect: "text" as const, next: table },
      { ask: "q", expect: "number" as const, next: table },
      { run: () => true, next: table },
      { reply: "x", next: table },
    ]) {
      expect(definitionError({ start: "q", steps: { q: step } })).toMatch(/"\*" yo'lini talab qiladi/);
      expect(() => defineFlow("demo", { start: "q", steps: { q: { ...step, next: { ...table, "*": null } } } })).not.toThrow();
    }
  });
});

describe("AskStep typing", () => {
  it("types `validate` by the step's `expect`", () => {
    const steps: Record<string, FlowStep> = {
      age: { ask: "q", expect: "number", validate: (n) => n >= 14 || "kamida 14", next: "name" },
      name: { ask: "q", expect: "text", validate: (s) => s.trim().length > 1, next: "phone" },
      phone: { ask: "q", expect: "contact", validate: (c) => c.phone_number.startsWith("+998"), next: null },
      // @ts-expect-error — a "number" step validates a number, which has no .trim()
      wrong: { ask: "q", expect: "number", validate: (n) => n.trim().length > 0, next: null },
    };
    expect(Object.keys(steps)).toHaveLength(4);
  });
});
