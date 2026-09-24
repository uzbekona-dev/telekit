import type { Update } from "@telekit/types";
import type { Kysely } from "kysely";
import type { MigrationProvider } from "kysely/migration";
import type { TelekitConfig } from "./config.js";
import { createContext, extractFrom, type Context } from "./context.js";
import {
  createDatabase,
  getMigrationStatus,
  resolveMigrationProviders,
  runMigrations,
  UserRepository,
  type TelekitDatabase,
  type TelekitUser,
} from "./db/index.js";
import { ConfigurationError, serializeError, TelegramApiError } from "./errors.js";
import { LOCALE_CALLBACK_PREFIX } from "./i18n/locale-picker.js";
import type { LocaleCandidates, Translator } from "./i18n/translator.js";
import { configureKeyboardDecorators } from "./keyboard-decorators.js";
import { resolveAppKey } from "./key.js";
import { createLogger, type Logger } from "./logger.js";
import { compose, type Middleware } from "./middleware.js";
import { UpdateDedup } from "./pipeline/dedup.js";
import { UpdateExecutor } from "./pipeline/executor.js";
import type { CommandDefinition, EventDefinition, InlineDefinition } from "./router.js";
import { Router } from "./router.js";
import { TelegramApi } from "./telegram/client.js";
import { Poller } from "./telegram/polling.js";
import { parseDuration } from "./util/duration.js";
import { checkUrlReachableViaHead, resolveAutoMode, type AutoModeWarning, type ResolvedMode } from "./webhook/auto-mode.js";
import { resolveSecretPath, resolveSecretToken } from "./webhook/secret.js";
import { WebhookServer } from "./webhook/server.js";

/** `last_seen_at` is batched, not written per-update — spec §30.1's "yozish optimizatsiyasi". */
const LAST_SEEN_FLUSH_INTERVAL_MS = 60_000;

function extractChatId(update: Update): number | undefined {
  return (
    update.message?.chat.id ??
    update.edited_message?.chat.id ??
    update.channel_post?.chat.id ??
    update.edited_channel_post?.chat.id ??
    update.callback_query?.message?.chat.id ??
    update.my_chat_member?.chat.id ??
    update.chat_member?.chat.id
  );
}

function assertRuntimeSecurity(config: TelekitConfig): void {
  if (config.app.env === "production" && !config.callbacks.sign && !config.callbacks.allowUnsignedInProduction) {
    throw new ConfigurationError("TK1003", "Production'da unsigned callback taqiqlangan");
  }
  if (config.callbacks.sign && config.app.env === "production" && !config.app.key) {
    throw new ConfigurationError("TK1003", "Production'da callback signing uchun APP_KEY majburiy");
  }
  if (config.app.key) {
    const decoded = Buffer.from(config.app.key, "base64");
    const normalized = config.app.key.replace(/=+$/u, "");
    const roundTrip = decoded.toString("base64").replace(/=+$/u, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(config.app.key) || decoded.length !== 32 || roundTrip !== normalized) {
      throw new ConfigurationError("TK1003", "APP_KEY 32 baytli base64 kalit bo'lishi kerak");
    }
  }
  if (![6, 8, 16].includes(config.callbacks.sigBytes)) {
    throw new ConfigurationError("TK1003", "callbacks.sigBytes faqat 6, 8 yoki 16 bo'lishi mumkin");
  }
}

export type ErrorHandler = (error: unknown, ctx: Context) => void | Promise<void>;

/** Small, framework-owned extension contract for reusable middleware/routes. */
export interface TelekitPlugin {
  name: string;
  setup(app: Application): void | Promise<void>;
}

/**
 * Ties config, the Telegram client, the update pipeline, and routing
 * together into one runnable bot (spec §13 Application lifecycle), with
 * polling/webhook ingress, bounded concurrency, persistence and graceful
 * shutdown owned by one lifecycle boundary.
 */
export class Application {
  readonly router = new Router();
  readonly api: TelegramApi;
  readonly log: Logger;
  readonly db?: Kysely<TelekitDatabase>;

  readonly config: TelekitConfig;
  private readonly dedup: UpdateDedup;
  private readonly executor: UpdateExecutor;
  private readonly globalMiddleware: Middleware[] = [];
  private readonly userRepository?: UserRepository;
  private readonly lastSeenBuffer = new Set<number>();
  private lastSeenTimer?: NodeJS.Timeout;
  private errorHandler?: ErrorHandler;
  private poller?: Poller;
  private webhookServer?: WebhookServer;
  private stopped = false;
  private shutdownHandlersInstalled = false;
  private translator?: Translator;
  private readonly migrationProviders: MigrationProvider[];
  private readonly signalHandlers = new Map<NodeJS.Signals, () => void>();
  private readonly plugins: TelekitPlugin[] = [];
  private pluginSetupPromise?: Promise<void>;

  /**
   * `deps.api`/`deps.db` let tests inject a `TelegramApi` built with a fake
   * `fetchImpl`, and an in-memory database, instead of hitting the real
   * network or filesystem (spec §28 — testing without real Telegram calls
   * or real files is a first-class requirement). Production code
   * (`createApplication(config)`) never passes either and gets the real
   * client and the database `config.database` describes.
   *
   * Other framework packages' migrations (e.g. `@telekit/conversations`)
   * join the same dev-auto-migrate / production-explicit-migrate flow as
   * core's own tables. Declare them in `config.database.migrations.providers`
   * — `telekit migrate` reads the same list — rather than in
   * `deps.migrationProviders`, which only this process sees (kept for tests
   * and programmatic use).
   */
  constructor(
    config: TelekitConfig,
    deps: { api?: TelegramApi; db?: Kysely<TelekitDatabase> | null; migrationProviders?: MigrationProvider[] } = {},
  ) {
    assertRuntimeSecurity(config);
    this.config = config;
    this.migrationProviders = [...resolveMigrationProviders(config.database), ...(deps.migrationProviders ?? [])];
    this.log = createLogger({
      level: config.logging.level,
      pretty: config.logging.pretty,
      base: { app: config.app.name },
    });
    this.api =
      deps.api ??
      new TelegramApi({
        token: config.bot.token,
        apiRoot: config.telegram.apiRoot,
        timeout: config.telegram.timeout,
        retry: config.telegram.retry,
        rateLimit: config.telegram.rateLimit,
        logger: this.log.child({ scope: "telegram" }),
      });
    this.db = deps.db !== undefined ? (deps.db ?? undefined) : (createDatabase(config.database) ?? undefined);
    this.userRepository = this.db ? new UserRepository(this.db) : undefined;
    this.dedup = new UpdateDedup(parseDuration(config.dedup.ttl));
    this.executor = new UpdateExecutor(config.concurrency.global, config.concurrency.perChat, config.concurrency.queueLimit);
    configureKeyboardDecorators(config.keyboards.decorators);
  }

  use(middleware: Middleware): this {
    this.globalMiddleware.push(middleware);
    return this;
  }

  /** Registers a reusable extension. Setup runs once, before migrations/startup. */
  plugin(plugin: TelekitPlugin): this {
    if (this.pluginSetupPromise) {
      throw new ConfigurationError("TK1051", `Plugin "${plugin.name}" prepare()/start() dan oldin ro'yxatdan o'tkazilishi kerak`);
    }
    if (this.plugins.some((registered) => registered.name === plugin.name)) {
      throw new ConfigurationError("TK1052", `Plugin "${plugin.name}" ikki marta ro'yxatdan o'tkazildi`);
    }
    this.plugins.push(plugin);
    return this;
  }

  /** Wired up by `loadLocales(app)` — never called directly in normal use (spec §26). */
  setTranslator(translator: Translator): void {
    this.translator = translator;
  }

  command(
    name: string,
    handler: CommandDefinition["handle"],
    options: Omit<CommandDefinition, "name" | "handle"> = {},
  ): this {
    this.router.registerCommand({ name, handle: handler, ...options });
    return this;
  }

  event(
    type: EventDefinition["type"],
    handler: EventDefinition["handle"],
    options: Omit<EventDefinition, "type" | "handle"> = {},
  ): this {
    this.router.registerEvent({ type, handle: handler, ...options });
    return this;
  }

  /** Inline mode: `app.inline(handler)` answers every query, `app.inline("gif ", handler)` / `app.inline(/^\d+$/, handler)` only matching ones (see `InlineDefinition`). */
  inline(handler: InlineDefinition["handle"]): this;
  inline(match: string | RegExp, handler: InlineDefinition["handle"], options?: Pick<InlineDefinition, "middleware">): this;
  inline(
    matchOrHandler: string | RegExp | InlineDefinition["handle"],
    handler?: InlineDefinition["handle"],
    options: Pick<InlineDefinition, "middleware"> = {},
  ): this {
    if (typeof matchOrHandler === "function") {
      this.router.registerInline({ handle: matchOrHandler });
    } else {
      this.router.registerInline({ match: matchOrHandler, handle: handler!, ...options });
    }
    return this;
  }

  onError(handler: ErrorHandler): this {
    this.errorHandler = handler;
    return this;
  }

  /** The webhook ingress server's actual bound port once `start()` has resolved to webhook mode — `undefined` in polling mode or before `start()`. Mainly useful with `webhook.port: 0` (OS-assigned) for health checks or tests. */
  get webhookPort(): number | undefined {
    return this.webhookServer?.port;
  }

  private async resolveMode(): Promise<{ mode: ResolvedMode; warnings: AutoModeWarning[] }> {
    if (this.config.bot.mode === "polling") return { mode: "polling", warnings: [] };
    if (this.config.bot.mode === "webhook") return { mode: "webhook", warnings: [] };
    return resolveAutoMode({
      env: this.config.app.env,
      publicUrl: this.config.webhook.url,
      checkUrlReachable: checkUrlReachableViaHead,
    });
  }

  private async syncCommands(): Promise<void> {
    const commands = this.router
      .listCommands()
      .filter((c): c is CommandDefinition & { description: string } => Boolean(c.description))
      .map((c) => ({ command: c.name, description: c.description }));
    if (commands.length === 0) return;

    try {
      await this.api.setMyCommands({ commands });
      this.log.debug({ event: "startup.commands_synced", count: commands.length }, "Buyruqlar menyusi sinxronlandi");
    } catch (err) {
      this.log.warn(
        { event: "startup.commands_sync_failed", err: serializeError(err) },
        "Buyruqlar Telegram menyusiga sinxronlanmadi (bot baribir ishlayveradi)",
      );
    }
  }

  private async ensureMigrations(): Promise<void> {
    if (!this.db) return;
    // this.db is only ever built for driver "sqlite" or "postgres" (see createDatabase) — "none" returns no db.
    const dialect = this.config.database.driver as "sqlite" | "postgres";
    const status = await getMigrationStatus(this.db, dialect, this.migrationProviders);
    if (status.pending.length === 0) return;

    if (this.config.app.env === "production") {
      throw new ConfigurationError(
        "TK1050",
        `Qo'llanmagan migratsiyalar bor: ${status.pending.join(", ")}. Production'da "telekit migrate" ni qo'lda ishga tushiring.`,
      );
    }

    this.log.info(
      { event: "startup.migrating", pending: status.pending },
      `${status.pending.length} ta migratsiya qo'llanmoqda...`,
    );
    await runMigrations(this.db, dialect, this.migrationProviders);
  }

  /**
   * Runs the setup `start()` needs that makes no network calls — currently
   * just migrations. Split out so `@telekit/testing`'s `createTestBot()`
   * (spec §28) can prepare an `Application` and drive it via `handleUpdate()`
   * directly, without `start()`'s `getMe`/`deleteWebhook`/`setMyCommands`
   * calls or its poll loop.
   */
  async prepare(): Promise<void> {
    this.pluginSetupPromise ??= (async () => {
      for (const plugin of this.plugins) await plugin.setup(this);
    })();
    await this.pluginSetupPromise;
    // Migration status is deliberately re-checked on every call: production
    // may fail once, then an operator runs `telekit migrate` and retries.
    await this.ensureMigrations();
  }

  async start(): Promise<void> {
    this.log.info({ event: "startup.begin" }, "Telekit ishga tushmoqda...");

    await this.prepare();

    const me = await this.api.getMe();
    this.log.info(
      { event: "startup.telegram_ok", bot_username: me.username, bot_id: me.id },
      `Telegram bilan aloqa o'rnatildi: @${me.username}`,
    );

    const { mode, warnings } = await this.resolveMode();
    for (const warning of warnings) {
      this.log.warn({ event: "startup.auto_mode_warning", code: warning.code }, warning.message);
    }

    await this.syncCommands();

    if (mode === "webhook") {
      await this.startWebhook();
    } else {
      await this.startPolling();
    }

    if (this.userRepository) {
      this.lastSeenTimer = setInterval(() => void this.flushLastSeen(), LAST_SEEN_FLUSH_INTERVAL_MS);
      this.lastSeenTimer.unref();
    }

    this.installShutdownHandlers();
    this.log.info({ event: "startup.ready" }, "Bot tayyor");
  }

  private async startPolling(): Promise<void> {
    // Idempotent no-op if no webhook was ever set — also covers the "webhook → polling" transition (spec §14.7's transition table).
    await this.api.deleteWebhook().catch((err: unknown) => {
      this.log.debug(
        { event: "startup.delete_webhook_failed", err: serializeError(err) },
        "deleteWebhook muvaffaqiyatsiz — odatda muammo emas",
      );
    });

    this.poller = new Poller({
      api: this.api,
      clock: this.api.clock,
      timeout: this.config.bot.polling.timeout,
      limit: this.config.bot.polling.limit,
      onUpdate: (update) => this.handleUpdate(update),
      maxInFlight: this.config.concurrency.global + this.config.concurrency.queueLimit,
      onError: (err) =>
        this.log.error({ event: "polling.error", err: serializeError(err) }, "Polling xatosi"),
      logger: this.log,
    });
    this.poller.start();
    this.log.info({ event: "startup.polling" }, "Polling boshlandi");
  }

  /** Sets/refreshes the Telegram-side webhook (skipping the API call if it's already correct — spec §14.7's transition table) and starts the local HTTP ingress. */
  private async startWebhook(): Promise<void> {
    const appKey = resolveAppKey(this.config);
    const secretPath = resolveSecretPath(this.config.webhook.path, appKey);
    const secretToken = resolveSecretToken(this.config.webhook.secretToken, appKey);
    const ingressPath = `/telegram/webhook/${secretPath}`;
    const fullUrl = `${this.config.webhook.url}${ingressPath}`;

    this.webhookServer = new WebhookServer({
      path: ingressPath,
      secretToken,
      ipAllowlist: this.config.webhook.ipAllowlist,
      responseMode: this.config.webhook.responseMode,
      onUpdate: (update) => this.handleUpdate(update),
      canAccept: () => this.executor.canAccept(),
      logger: this.log,
    });
    await this.webhookServer.listen(this.config.webhook.port);

    try {
      const info = await this.api.getWebhookInfo();
      if (info.url !== fullUrl) {
        await this.api.setWebhook({
          url: fullUrl,
          secret_token: secretToken,
          max_connections: this.config.webhook.maxConnections,
          drop_pending_updates: this.config.webhook.dropPendingUpdates,
        });
        this.log.info({ event: "startup.webhook_set", url: fullUrl }, "Webhook o'rnatildi");
      } else {
        this.log.debug({ event: "startup.webhook_unchanged" }, "Webhook allaqachon to'g'ri URL'da — API chaqirilmadi");
      }
    } catch (error) {
      await this.webhookServer.close();
      this.webhookServer = undefined;
      throw error;
    }
    this.log.info(
      { event: "startup.webhook_listening", port: this.config.webhook.port, path: ingressPath },
      `Webhook tinglamoqda: :${this.config.webhook.port}${ingressPath}`,
    );
  }

  private async flushLastSeen(): Promise<void> {
    if (this.lastSeenBuffer.size === 0 || !this.userRepository) return;
    const ids = [...this.lastSeenBuffer];
    this.lastSeenBuffer.clear();
    try {
      await this.userRepository.touchLastSeen(ids);
    } catch (err) {
      this.log.warn({ event: "last_seen.flush_failed", err: serializeError(err) }, "last_seen_at yozilmadi");
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.log.info({ event: "shutdown.begin" }, "To'xtatilmoqda...");
    this.executor.stopAccepting();
    this.webhookServer?.setDraining();
    await this.poller?.stop();
    if (this.config.shutdown.drainDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.shutdown.drainDelayMs));
    }
    await this.webhookServer?.close();
    let drainError: unknown;
    try {
      await this.executor.drain(this.config.shutdown.timeoutMs);
    } catch (error) {
      drainError = error;
      this.log.error({ event: "shutdown.drain_timeout", err: serializeError(error) }, "Update'larni kutish vaqti tugadi");
    }
    if (this.lastSeenTimer) clearInterval(this.lastSeenTimer);
    await this.flushLastSeen();
    await this.db?.destroy();
    for (const [signal, handler] of this.signalHandlers) process.removeListener(signal, handler);
    this.signalHandlers.clear();
    this.log.info({ event: "shutdown.complete" }, "To'xtatildi");
    if (drainError) throw drainError;
  }

  private installShutdownHandlers(): void {
    if (this.shutdownHandlersInstalled) return;
    this.shutdownHandlersInstalled = true;

    const onSignal = (signal: NodeJS.Signals) => {
      this.log.info({ event: "shutdown.signal", signal }, `${signal} qabul qilindi`);
      this.stop()
        .then(() => process.exit(0))
        .catch((err: unknown) => {
          this.log.fatal({ event: "shutdown.failed", err: serializeError(err) }, "To'xtatishda xato");
          process.exit(1);
        });
    };
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      const handler = () => onSignal(signal);
      this.signalHandlers.set(signal, handler);
      process.once(signal, handler);
    }
  }

  /** A 403 "bot was blocked by the user" means the user is unreachable — record it so broadcasts and analytics skip them (spec §30.1, §28.4). */
  private async markBlockedIfNeeded(err: unknown, user: TelekitUser | undefined): Promise<void> {
    if (!this.userRepository || !user) return;
    if (!(err instanceof TelegramApiError) || !err.isBlockedByUser) return;
    try {
      await this.userRepository.markBlocked(user.id);
    } catch (markErr) {
      this.log.warn({ event: "user.mark_blocked_failed", err: serializeError(markErr) }, "status=blocked yozilmadi");
    }
  }

  /** Built-in pipeline step (spec §17.1, "020 userUpsert") — runs before any user middleware. */
  private async upsertUser(update: Update) {
    if (!this.userRepository) return undefined;
    const from = extractFrom(update);
    if (!from) return undefined;

    const user = await this.userRepository.upsertFromTelegram(from);
    this.lastSeenBuffer.add(from.id);
    return user;
  }

  private resolveLocaleAndT(update: Update, user: TelekitUser | undefined) {
    if (!this.translator) {
      return { locale: this.config.app.locale, t: (key: string) => key };
    }
    const candidates: LocaleCandidates = {
      userLocale: user?.locale,
      telegramLanguageCode: extractFrom(update)?.language_code,
    };
    const locale = this.translator.resolveLocale(candidates);
    return { locale, t: (key: string, params?: Record<string, unknown>) => this.translator!.translate(locale, key, params) };
  }

  /**
   * Intercepts `localePicker()`'s `lang:<code>` buttons directly — before
   * global middleware/routing — so switching languages needs no wiring
   * beyond `loadLocales()` + the built-in `localePicker()` component (spec
   * §26.4). Returns `true` if it handled (and fully consumed) the update.
   */
  private async handleLocaleSwitch(ctx: Context): Promise<boolean> {
    const data = ctx.callback?.data;
    if (!this.translator || !data?.startsWith(LOCALE_CALLBACK_PREFIX)) return false;

    const locale = data.slice(LOCALE_CALLBACK_PREFIX.length);
    if (!this.translator.listSupportedLocales().includes(locale)) return false;

    if (this.userRepository && ctx.user) {
      await this.userRepository.setLocale(ctx.user.id, locale);
    }
    await ctx.answerCallback({ text: "✓" }).catch(() => {});
    return true;
  }

  /**
   * Runs a single update through the full pipeline (dedup → sequencer →
   * user upsert → locale → global middleware → router). Public — driven
   * directly by `poller`/`webhookServer` in production, and by
   * `@telekit/testing`'s `createTestBot()` in tests, which calls this
   * instead of `start()` so no real network or poll loop is ever involved
   * (spec §28.1's "zero network calls" guarantee).
   */
  async handleUpdate(update: Update): Promise<void> {
    if (this.config.dedup.enabled && this.dedup.isDuplicate(update.update_id)) {
      this.log.debug(
        { event: "dedup.dropped", update_id: update.update_id },
        "Takrorlangan update tashlab yuborildi",
      );
      return;
    }

    const chatId = extractChatId(update);

    await this.executor.run(chatId, async () => {
      const user = await this.upsertUser(update);
      const { locale, t } = this.resolveLocaleAndT(update, user);
      const ctx = createContext(update, { api: this.api, log: this.log, db: this.db, user, locale, t });

      if (await this.handleLocaleSwitch(ctx)) return;

      const startedAt = Date.now();
      try {
        await compose(this.globalMiddleware, ctx, async () => {
          const handled = await this.router.dispatch(ctx);
          if (!handled) {
            this.log.debug(
              { event: "route.unhandled", update_id: update.update_id },
              "Hech qanday route mos kelmadi",
            );
          }
        });
        this.log.info(
          { event: "update.handled", update_id: update.update_id, duration_ms: Date.now() - startedAt },
          "Update qayta ishlandi",
        );
      } catch (err) {
        this.log.error(
          { event: "update.error", update_id: update.update_id, err: serializeError(err) },
          "Handler xatosi",
        );
        await this.markBlockedIfNeeded(err, user);
        if (this.errorHandler) {
          try {
            await this.errorHandler(err, ctx);
          } catch (handlerErr) {
            this.log.fatal(
              { event: "error_handler.failed", err: serializeError(handlerErr) },
              "onError handlerining o'zi xato berdi",
            );
          }
        }
      }
    });
  }
}

export function createApplication(
  config: TelekitConfig,
  deps?: { api?: TelegramApi; migrationProviders?: MigrationProvider[] },
): Application {
  return new Application(config, deps);
}
