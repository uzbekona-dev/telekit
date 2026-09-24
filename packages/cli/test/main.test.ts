import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cliVersion, helpText, main } from "../src/main.js";
import { captureConsole } from "./helpers.js";

const commands = vi.hoisted(() => ({
  runNew: vi.fn(async () => 11),
  runDev: vi.fn(async () => 12),
  runBuild: vi.fn(async () => 13),
  runStart: vi.fn(async () => 14),
  runDoctor: vi.fn(async () => 15),
  runMigrate: vi.fn(async () => 16),
  runRoutes: vi.fn(async () => 17),
  runI18nCheck: vi.fn(async () => 18),
}));

vi.mock("../src/commands/new.js", () => ({ runNew: commands.runNew }));
vi.mock("../src/commands/dev.js", () => ({ runDev: commands.runDev }));
vi.mock("../src/commands/build.js", () => ({ runBuild: commands.runBuild }));
vi.mock("../src/commands/start.js", () => ({ runStart: commands.runStart }));
vi.mock("../src/commands/doctor.js", () => ({ runDoctor: commands.runDoctor }));
vi.mock("../src/commands/migrate.js", () => ({ runMigrate: commands.runMigrate }));
vi.mock("../src/commands/routes.js", () => ({ runRoutes: commands.runRoutes }));
vi.mock("../src/commands/i18n-check.js", () => ({ runI18nCheck: commands.runI18nCheck }));

describe("CLI dispatch", () => {
  let console_: { out: string[]; err: string[] };
  beforeEach(() => {
    console_ = captureConsole();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes each command to its handler and returns the handler's exit code", async () => {
    expect(await main(["new", "bot", "--template=standard"])).toBe(11);
    expect(commands.runNew).toHaveBeenCalledWith(["bot", "--template=standard"]);
    expect(await main(["dev"])).toBe(12);
    expect(await main(["build"])).toBe(13);
    expect(await main(["start"])).toBe(14);
    expect(await main(["doctor"])).toBe(15);
    expect(await main(["migrate"])).toBe(16);
    expect(commands.runMigrate).toHaveBeenLastCalledWith("latest");
    expect(await main(["migrate:status"])).toBe(16);
    expect(commands.runMigrate).toHaveBeenLastCalledWith("status");
    expect(await main(["routes"])).toBe(17);
    expect(await main(["i18n:check", "--strict"])).toBe(18);
    expect(commands.runI18nCheck).toHaveBeenCalledWith(["--strict"]);
  });

  it("prints the version from package.json", async () => {
    const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

    expect(await main(["--version"])).toBe(0);
    expect(await main(["-v"])).toBe(0);
    expect(console_.out).toEqual([version, version]);
    expect(cliVersion()).toBe(version);
  });

  it("prints help for no command, --help and -h", async () => {
    for (const argv of [[], ["--help"], ["-h"]]) {
      expect(await main(argv)).toBe(0);
    }
    expect(console_.out).toEqual([helpText(), helpText(), helpText()]);
    expect(helpText("9.9.9")).toMatch(/^Telekit CLI v9\.9\.9\n/);
  });

  it("rejects an unknown command with exit code 1", async () => {
    expect(await main(["deploy"])).toBe(1);
    expect(console_.err[0]).toContain('Noma\'lum buyruq: "deploy"');
    expect(console_.out[0]).toBe(helpText());
  });
});
