import {
  Application,
  DEFAULT_CONFIG,
  MIGRATION_LOCK_TABLE_NAME,
  MIGRATION_TABLE_NAME,
  TelegramApi,
  UserRepository,
  type Chat,
  type TelekitConfig,
  type TelekitUser,
  type User,
} from "@telekit/core";
import { TestActor } from "./actor.js";
import { TestClock } from "./clock.js";
import { FakeTelegram } from "./fake-telegram.js";
import { TestRuntime } from "./runtime.js";

type TestKysely = NonNullable<Application["db"]>;
type MigrationProviders = NonNullable<ConstructorParameters<typeof Application>[1]>["migrationProviders"];

export type TestConfigOverrides = { [K in keyof TelekitConfig]?: Partial<TelekitConfig[K]> };

export interface CreateTestBotOptions {
  /** Default sender; merged over `{ id: 1, first_name: "Test", username: "tester" }`. */
  user?: Partial<User>;
  /** Default chat; a private chat with `user` when omitted. */
  chat?: Chat;
  /** Sets both `app.locale` and the default user's `language_code`. */
  locale?: string;
  /** `"memory"` (default): a fresh in-memory SQLite database per bot, all migrations applied. `"none"`: no database. */
  database?: "memory" | "none";
  /** Per-section overrides applied on top of the test defaults. */
  config?: TestConfigOverrides;
  /**
   * Extra migrations passed straight to `Application` (its `deps`). Projects
   * normally declare them in config instead — `config: { database: { migrations:
   * { providers: [createConversationsMigrationProvider] } } }` — as their
   * telekit.config.ts does.
   */
  migrationProviders?: MigrationProviders;
  /**
   * When `true` (default), any `clock.sleep()` the pipeline parks on — e.g.
   * the Telegram client's 429 retry backoff — is fast-forwarded immediately,
   * so `bot.api.mock("sendMessage", { error: { error_code: 429, ... } })`
   * just works. Set `false` to drive every wait by hand with `bot.clock.advance()`.
   */
  autoAdvance?: boolean;
  /**
   * Register routes/middleware here: `app.command(...)`, `loadRoutes(app, ...)`,
   * `loadLocales(app, ...)`, `app.use(sessions({ store: new MemorySessionStore(bot.clock) }))`,
   * `app.use(installConversations([...], { store: new DatabaseConversationStore(app.db!), clock: bot.clock }))`.
   */
  setup?: (app: Application, bot: TestBot) => void | Promise<void>;
}

export interface TestDatabase {
  kysely: TestKysely;
  users: {
    count(): Promise<number>;
    findById(id: number): Promise<TelekitUser | null>;
    all(): Promise<TelekitUser[]>;
  };
}

/** Deterministic, non-secret 32-byte key so callback signatures are stable within and across test runs. */
const TEST_APP_KEY = Buffer.alloc(32, 7).toString("base64");
const TEST_BOT_USER: User = { id: 999_999, is_bot: true, first_name: "TestBot", username: "telekit_test_bot" };

/** The object `createTestBot()` returns (spec §28.2). */
export class TestBot extends TestActor {
  constructor(
    runtime: TestRuntime,
    user: User,
    chat: Chat | undefined,
    readonly db: TestDatabase | undefined,
  ) {
    super(runtime, user, chat);
  }

  get app(): Application {
    return this.runtime.app;
  }

  /** The fake Telegram backend: `bot.api.mock(...)`, `bot.api.registerFile(...)`, `bot.api.calls`. */
  get api(): FakeTelegram {
    return this.runtime.fake;
  }

  get clock(): TestClock {
    return this.runtime.clock;
  }

  /** For `afterEach`: drops queued mocks and recorded calls, and empties every database table (migrations stay applied). */
  async reset(): Promise<void> {
    this.runtime.fake.clear();
    if (!this.db) return;

    const { kysely } = this.db;
    const skip = new Set([MIGRATION_TABLE_NAME, MIGRATION_LOCK_TABLE_NAME]);
    for (const table of await kysely.introspection.getTables()) {
      if (skip.has(table.name) || table.name.startsWith("sqlite_")) continue;
      await kysely.deleteFrom(table.name as "telekit_users").execute();
    }
  }

  /** Closes the database. Call from `afterEach`/`afterAll`. */
  async close(): Promise<void> {
    await this.runtime.app.stop();
  }
}

function buildConfig(options: CreateTestBotOptions): TelekitConfig {
  const base: TelekitConfig = {
    ...DEFAULT_CONFIG,
    app: {
      ...DEFAULT_CONFIG.app,
      name: "telekit-test",
      env: "test",
      locale: options.locale ?? DEFAULT_CONFIG.app.locale,
      key: TEST_APP_KEY,
    },
    bot: { ...DEFAULT_CONFIG.bot, token: "123456:TEST-TOKEN", mode: "polling" },
    database:
      (options.database ?? "memory") === "memory"
        ? { driver: "sqlite", file: ":memory:", url: null }
        : { driver: "none", file: "", url: null },
    logging: { level: "fatal", pretty: false },
  };

  const merged: Record<string, unknown> = { ...base };
  for (const [section, patch] of Object.entries(options.config ?? {})) {
    merged[section] = { ...(base[section as keyof TelekitConfig] as object), ...patch };
  }
  return merged as unknown as TelekitConfig;
}

function buildTestDatabase(kysely: TestKysely): TestDatabase {
  const repository = new UserRepository(kysely);
  return {
    kysely,
    users: {
      async count() {
        const row = await kysely
          .selectFrom("telekit_users")
          .select((eb) => eb.fn.countAll().as("n"))
          .executeTakeFirst();
        return Number(row?.n ?? 0);
      },
      findById: (id) => repository.findById(id),
      async all() {
        const rows = await kysely.selectFrom("telekit_users").select("id").orderBy("id").execute();
        const users = await Promise.all(rows.map((r) => repository.findById(r.id)));
        return users.filter((u): u is TelekitUser => u !== null);
      },
    },
  };
}

/**
 * Builds a fully wired `Application` against a fake Telegram backend, a
 * virtual clock and (by default) a fresh in-memory database — no network,
 * no files, safe for parallel test files (spec §28).
 */
export async function createTestBot(options: CreateTestBotOptions = {}): Promise<TestBot> {
  const config = buildConfig(options);
  const clock = new TestClock();
  const fake = new FakeTelegram(TEST_BOT_USER);
  const api = new TelegramApi({
    token: config.bot.token,
    apiRoot: config.telegram.apiRoot,
    retry: config.telegram.retry,
    fetchImpl: fake.fetch,
    clock,
  });
  const app = new Application(config, { api, migrationProviders: options.migrationProviders });
  // Must be constructed before `setup` runs: it installs the recording middleware ahead of the project's own.
  const runtime = new TestRuntime(app, fake, clock, options.autoAdvance ?? true);

  const user: User = {
    id: 1,
    is_bot: false,
    first_name: "Test",
    username: "tester",
    ...(options.locale !== undefined ? { language_code: options.locale } : {}),
    ...options.user,
  };
  const bot = new TestBot(runtime, user, options.chat, app.db ? buildTestDatabase(app.db) : undefined);

  await options.setup?.(app, bot);
  await app.prepare();
  return bot;
}
