import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBuild } from "../src/commands/build.js";
import { resolveEntry, runDev } from "../src/commands/dev.js";
import { runI18nCheck } from "../src/commands/i18n-check.js";
import { runMigrate } from "../src/commands/migrate.js";
import { runRoutes } from "../src/commands/routes.js";
import { resolveCompiledEntry, runStart } from "../src/commands/start.js";
import { resolveTsxCli } from "../src/process.js";
import { captureConsole, FakeChild, makeProject, removeProject, snapshotEnv } from "./helpers.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("../src/resolve-from-project.js", () => ({
  resolveFromProject: (cwd: string, specifier: string) => path.join(cwd, "node_modules", specifier),
}));

const spawnMock = vi.mocked(spawn);

/** Every spawn exits with `code`; `simulate` plays the runner's part (e.g. writing its result file). */
function childrenExit(code: number, simulate?: (args: readonly string[], env: NodeJS.ProcessEnv | undefined) => void): void {
  spawnMock.mockImplementation(((_cmd: string, args: readonly string[], options: { env?: NodeJS.ProcessEnv }) => {
    const child = new FakeChild();
    setImmediate(() => {
      simulate?.(args, options.env);
      child.emit("exit", code);
    });
    return child;
  }) as unknown as typeof spawn);
}

function spawnedArgs(): readonly string[] {
  return spawnMock.mock.calls[0]?.[1] as readonly string[];
}

const PROJECT = { "telekit.config.ts": "export default {}" };

let dir: string;
let restoreEnv: () => void;
let console_: { out: string[]; err: string[] };

beforeEach(() => {
  spawnMock.mockReset();
  restoreEnv = snapshotEnv();
  delete process.env.APP_ENV;
  delete process.env.APP_LOCALE;
  console_ = captureConsole();
});
afterEach(() => {
  restoreEnv();
  removeProject(dir);
  vi.restoreAllMocks();
});

describe("telekit build", () => {
  it("runs the project's own tsc against tsconfig.json", async () => {
    dir = makeProject({ "tsconfig.json": "{}" });
    childrenExit(0);

    await expect(runBuild({ cwd: dir })).resolves.toBe(0);

    expect(spawnedArgs()).toEqual([path.join(dir, "node_modules", "typescript/bin/tsc"), "-p", path.join(dir, "tsconfig.json")]);
    expect(console_.out.at(-1)).toContain("✓ Build tugadi");
  });

  it("propagates a failed compile without claiming success", async () => {
    dir = makeProject({ "tsconfig.json": "{}" });
    childrenExit(2);

    await expect(runBuild({ cwd: dir })).resolves.toBe(2);
    expect(console_.out.join("\n")).not.toContain("✓ Build tugadi");
  });

  it("refuses to run outside a TypeScript project", async () => {
    dir = makeProject();
    await expect(runBuild({ cwd: dir })).rejects.toThrow("tsconfig.json topilmadi");
  });
});

describe("telekit dev", () => {
  it("watches main.ts through tsx with the .env cascade loaded", async () => {
    dir = makeProject({ "main.ts": "", ".env": "DEV_ONLY_VAR=1" });
    childrenExit(0);

    await expect(runDev({ cwd: dir })).resolves.toBe(0);

    expect(spawnedArgs()).toEqual([resolveTsxCli(), "watch", path.join(dir, "main.ts")]);
    expect(process.env.DEV_ONLY_VAR).toBe("1");
    expect(console_.out[0]).toContain("main.ts kuzatilmoqda");
  });

  it("falls back to src/main.ts, and explains a missing entry", () => {
    dir = makeProject({ "src/main.ts": "" });
    expect(resolveEntry(dir)).toBe(path.join(dir, "src", "main.ts"));

    removeProject(dir);
    dir = makeProject();
    expect(() => resolveEntry(dir)).toThrow("main.ts topilmadi");
  });
});

describe("telekit start", () => {
  it("runs dist/main.js with APP_ENV=production and the production .env files", async () => {
    dir = makeProject({
      "dist/main.js": "",
      ".env.development": "START_VAR=development",
      ".env.production": "START_VAR=production",
    });
    let childEnv: NodeJS.ProcessEnv | undefined;
    childrenExit(0, (_args, env) => {
      childEnv = env;
    });

    await expect(runStart({ cwd: dir })).resolves.toBe(0);

    expect(spawnedArgs()).toEqual([path.join(dir, "dist", "main.js")]);
    expect(childEnv?.APP_ENV).toBe("production");
    expect(childEnv?.START_VAR).toBe("production");
  });

  it("keeps an APP_ENV exported by the shell", async () => {
    dir = makeProject({ "dist/main.js": "", ".env.staging": "START_VAR=staging" });
    process.env.APP_ENV = "staging";
    let childEnv: NodeJS.ProcessEnv | undefined;
    childrenExit(0, (_args, env) => {
      childEnv = env;
    });

    await runStart({ cwd: dir });

    expect(childEnv?.APP_ENV).toBe("staging");
    expect(childEnv?.START_VAR).toBe("staging");
  });

  it("falls back to dist/src/main.js, and asks for a build when nothing is compiled", () => {
    dir = makeProject({ "dist/src/main.js": "" });
    expect(resolveCompiledEntry(dir)).toBe(path.join(dir, "dist", "src", "main.js"));

    removeProject(dir);
    dir = makeProject();
    expect(() => resolveCompiledEntry(dir)).toThrow('Avval "telekit build"');
  });
});

describe("telekit migrate", () => {
  it("runs the migrate runner inside the project with the subcommand", async () => {
    dir = makeProject(PROJECT);
    childrenExit(1);

    await expect(runMigrate("status", { cwd: dir })).resolves.toBe(1);

    const runner = path.join(dir, ".telekit", "migrate-runner.mjs");
    expect(spawnedArgs()).toEqual([resolveTsxCli(), runner, "status"]);
    const source = readFileSync(runner, "utf8");
    expect(source).toContain('import config from "../telekit.config.js"');
    // the same provider list Application checks at startup — see core's resolveMigrationProviders
    expect(source).toContain("core.resolveMigrationProviders(config.database)");
    expect(source).toContain("core.getMigrationStatus(db, dialect, providers)");
    expect(source).toContain("core.runMigrations(db, dialect, providers)");
  });

  it("refuses to run outside a telekit project", async () => {
    dir = makeProject();
    await expect(runMigrate("latest", { cwd: dir })).rejects.toThrow("telekit.config.ts topilmadi");
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe("telekit routes", () => {
  it("prints the budget table from what the runner collected", async () => {
    dir = makeProject(PROJECT);
    childrenExit(0, (args) =>
      writeFileSync(
        args.at(-1)!,
        JSON.stringify({ budget: 37, collision: null, handles: [{ name: "counter.increment", routeId: "Ab12", fields: [] }] }),
      ),
    );

    await expect(runRoutes({ cwd: dir })).resolves.toBe(0);

    expect(readFileSync(path.join(dir, ".telekit", "routes-runner.mjs"), "utf8")).toContain("createCallbackRegistry");
    expect(console_.out).toContain("1 ta callback, 0 tasi nazariy maksimalda budjetdan oshadi (ref store orqali ishlaydi).");
  });

  it("exits 1 on a routeId collision", async () => {
    dir = makeProject(PROJECT);
    childrenExit(0, (args) =>
      writeFileSync(args.at(-1)!, JSON.stringify({ budget: 37, collision: "to'qnashuv", handles: [{ name: "a", routeId: "abcd", fields: [] }] })),
    );

    await expect(runRoutes({ cwd: dir })).resolves.toBe(1);
    expect(console_.out).toContain("✖ Callback ID collision");
  });
});

describe("telekit i18n:check", () => {
  const resources = { uz: { "bot.a": "1", "bot.b": "2" }, ru: { "bot.a": "1" } };

  function runnerReturns(value: unknown): void {
    childrenExit(0, (args) => writeFileSync(args.at(-1)!, JSON.stringify(value)));
  }

  it("reports missing keys but only fails with --strict", async () => {
    dir = makeProject(PROJECT);
    runnerReturns(resources);

    await expect(runI18nCheck([], { cwd: dir })).resolves.toBe(0);
    expect(console_.out).toContain("ru/bot.json        1 ta kalit yetishmayapti");

    await expect(runI18nCheck(["--strict"], { cwd: dir })).resolves.toBe(1);
  });

  it("compares against APP_LOCALE (from .env) instead of uz", async () => {
    dir = makeProject({ ...PROJECT, ".env": "APP_LOCALE=ru" });
    runnerReturns(resources);

    await runI18nCheck([], { cwd: dir });

    expect(console_.out).toContain("ru/bot.json        ✓  (reference)");
    expect(console_.out).toContain("1 ta ortiqcha kalit: uz/bot.json → bot.b");
  });

  it("fails when the reference locale has no resources", async () => {
    dir = makeProject(PROJECT);
    runnerReturns({ ru: {} });

    await expect(runI18nCheck([], { cwd: dir })).resolves.toBe(1);
    expect(console_.err[0]).toContain('Reference locale "uz"');
  });
});
