import { AsyncLocalStorage } from "node:async_hooks";
import type { Application, Context, Middleware, Update } from "@telekit/core";
import type { TestClock } from "./clock.js";
import type { ApiCall, FakeTelegram } from "./fake-telegram.js";
import { buildResult, type ConversationOutcome, type TestResult, type TranslationCall } from "./result.js";
import { UpdateFactory } from "./updates.js";

/** Runs in place of routing for one specific update — how the conversation harness calls `ctx.enter()` after every middleware has run. */
export type RoutingProbe = (ctx: Context) => Promise<void>;

export interface DispatchOutcome {
  result: TestResult;
  /** Whether the probe passed to `dispatch()` actually ran — `false` if middleware (e.g. an active conversation) consumed the update before routing. */
  probeRan: boolean;
}

/** Everything one in-flight update produced. Lives in an `AsyncLocalStorage`, so concurrent dispatches never see each other's calls or errors. */
interface Recording {
  calls: ApiCall[];
  translations: TranslationCall[];
  conversation?: ConversationOutcome;
  error?: unknown;
  probe?: RoutingProbe;
  probeRan: boolean;
}

type Settled = { ok: true } | { ok: false; error: unknown };

/** State shared by a bot and every `as()`/`inChat()` view of it. */
export class TestRuntime {
  readonly updates = new UpdateFactory();
  private readonly recordings = new AsyncLocalStorage<Recording>();
  private pumpChain: Promise<void> = Promise.resolve();

  constructor(
    readonly app: Application,
    readonly fake: FakeTelegram,
    readonly clock: TestClock,
    readonly autoAdvance: boolean,
  ) {
    fake.observe((call) => this.recordings.getStore()?.calls.push(call));
    app.use(this.recorder());
    this.interceptRouting();
  }

  async dispatch(update: Update, probe?: RoutingProbe): Promise<DispatchOutcome> {
    const recording: Recording = { calls: [], translations: [], probe, probeRan: false };
    const startedAt = performance.now();

    const settled = await this.recordings.run(recording, () => this.drive(this.app.handleUpdate(update)));

    const result = buildResult({
      calls: recording.calls,
      translations: recording.translations,
      conversation: recording.conversation,
      error: recording.error ?? (settled.ok ? undefined : settled.error),
      duration: performance.now() - startedAt,
    });
    return { result, probeRan: recording.probeRan };
  }

  /** Awaits `work`, fast-forwarding the virtual clock whenever the pipeline is parked on a `clock.sleep()` (see `autoAdvance`). */
  private async drive(work: Promise<void>): Promise<Settled> {
    let done = false;
    const settled = work.then(
      (): Settled => ({ ok: true }),
      (error: unknown): Settled => ({ ok: false, error }),
    );
    void settled.then(() => {
      done = true;
    });

    while (this.autoAdvance && !done) {
      await this.pump();
    }
    return settled;
  }

  /** One auto-advance step. Chained so concurrent dispatches take turns instead of calling `clock.advance()` at the same time. */
  private pump(): Promise<void> {
    const step = this.pumpChain.then(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      const next = this.clock.nextDeadline();
      if (next !== null) await this.clock.advance(Math.max(0, next - this.clock.now()));
    });
    this.pumpChain = step.catch(() => {});
    return step;
  }

  /** Installed ahead of all user middleware: records `ctx.t()` calls, the handler error and the conversation outcome of the current dispatch. */
  private recorder(): Middleware {
    return async (ctx, next) => {
      const recording = this.recordings.getStore();
      if (!recording) {
        await next();
        return;
      }

      const translate = ctx.t;
      (ctx as { t: Context["t"] }).t = (key, params) => {
        const text = translate(key, params);
        recording.translations.push({ key, params, text });
        return text;
      };

      try {
        await next();
      } catch (err) {
        recording.error = err;
        throw err;
      } finally {
        // Written by @telekit/conversations — read structurally so this package doesn't depend on it.
        const outcome = (ctx as { conversation?: ConversationOutcome }).conversation;
        if (outcome) recording.conversation = { name: outcome.name, status: outcome.status };
      }
    };
  }

  /** Lets a dispatch replace routing with a probe — it then runs exactly where a command handler would, after every middleware. */
  private interceptRouting(): void {
    const router = this.app.router;
    const route = router.dispatch.bind(router);
    router.dispatch = async (ctx: Context) => {
      const recording = this.recordings.getStore();
      if (!recording?.probe) return route(ctx);
      recording.probeRan = true;
      await recording.probe(ctx);
      return true;
    };
  }
}
