import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forwardSignals, resolveTsxCli, runNode } from "../src/process.js";
import { assertTelekitProject, queryProject, runProjectScript } from "../src/project.js";
import { resolveFromProject } from "../src/resolve-from-project.js";
import { FakeChild, makeProject, removeProject } from "./helpers.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const spawnMock = vi.mocked(spawn);
const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Makes the next spawn() exit with `code` (after running `beforeExit`, e.g. to write a runner's result file). */
function nextChildExits(code: number | null, beforeExit?: (args: readonly string[]) => void): FakeChild {
  const child = new FakeChild();
  spawnMock.mockImplementationOnce(((_cmd: string, args: readonly string[]) => {
    setImmediate(() => {
      beforeExit?.(args);
      child.emit("exit", code, code === null ? "SIGKILL" : null);
    });
    return child;
  }) as unknown as typeof spawn);
  return child;
}

describe("runNode", () => {
  beforeEach(() => spawnMock.mockReset());

  it("runs `node <args>` with inherited stdio and resolves with the exit code", async () => {
    nextChildExits(3);
    const env = { CUSTOM: "1" };

    await expect(runNode(["script.js", "--flag"], { cwd: "/project", env })).resolves.toBe(3);

    expect(spawnMock).toHaveBeenCalledWith(process.execPath, ["script.js", "--flag"], {
      cwd: "/project",
      stdio: "inherit",
      env,
    });
  });

  it("defaults the child's env to process.env", async () => {
    nextChildExits(0);
    await runNode([], { cwd: "/p" });
    expect(spawnMock.mock.calls[0]?.[2]).toMatchObject({ env: process.env });
  });

  it("reports a signal-killed child as a failure, not success", async () => {
    nextChildExits(null);
    await expect(runNode([], { cwd: "/p" })).resolves.toBe(1);
  });

  it("rejects when the child can't be spawned", async () => {
    const child = new FakeChild();
    spawnMock.mockImplementationOnce((() => {
      setImmediate(() => child.emit("error", new Error("spawn ENOENT")));
      return child;
    }) as unknown as typeof spawn);

    await expect(runNode([], { cwd: "/p" })).rejects.toThrow("spawn ENOENT");
  });

  it("forwards SIGINT/SIGTERM to the child while it runs, then stops listening", async () => {
    const before = { int: process.listenerCount("SIGINT"), term: process.listenerCount("SIGTERM") };
    const child = new FakeChild();
    spawnMock.mockImplementationOnce((() => child) as unknown as typeof spawn);

    const running = runNode([], { cwd: "/p", forwardSignals: true });
    expect(process.listenerCount("SIGINT")).toBe(before.int + 1);
    expect(process.listenerCount("SIGTERM")).toBe(before.term + 1);
    child.emit("exit", 0);
    await running;

    expect(process.listenerCount("SIGINT")).toBe(before.int);
    expect(process.listenerCount("SIGTERM")).toBe(before.term);
  });
});

describe("forwardSignals", () => {
  it("relays each signal once and unsubscribes on cleanup", () => {
    const child = new FakeChild();
    const target = new EventEmitter();

    const stop = forwardSignals(child, target);
    target.emit("SIGINT");
    target.emit("SIGINT");
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith("SIGINT");

    stop();
    target.emit("SIGTERM");
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(target.listenerCount("SIGTERM")).toBe(0);
  });
});

describe("module resolution", () => {
  it("resolveTsxCli() finds the tsx CLI shipped with @telekit/cli", () => {
    expect(resolveTsxCli()).toMatch(/tsx[\\/]dist[\\/]cli\.[cm]?js$/);
  });

  it("resolveFromProject() resolves from the project's own node_modules", () => {
    expect(resolveFromProject(cliRoot, "typescript/bin/tsc")).toMatch(/typescript[\\/]bin[\\/]tsc$/);
    expect(() => resolveFromProject(cliRoot, "definitely-not-installed-pkg")).toThrow();
  });
});

describe("project scripts", () => {
  let dir: string;
  beforeEach(() => spawnMock.mockReset());
  afterEach(() => removeProject(dir));

  it("assertTelekitProject accepts telekit.config.ts or .js and rejects anything else", () => {
    dir = makeProject();
    expect(() => assertTelekitProject(dir)).toThrow(/telekit.config.ts topilmadi/);

    writeFileSync(path.join(dir, "telekit.config.js"), "export default {}");
    expect(() => assertTelekitProject(dir)).not.toThrow();
  });

  it("runProjectScript writes the runner into .telekit/ and runs it through tsx", async () => {
    dir = makeProject();
    nextChildExits(0);

    await expect(runProjectScript(dir, "demo", "console.log(1)", ["a", "b"])).resolves.toBe(0);

    const runner = path.join(dir, ".telekit", "demo-runner.mjs");
    expect(readFileSync(runner, "utf8")).toBe("console.log(1)");
    expect(spawnMock.mock.calls[0]?.[1]).toEqual([resolveTsxCli(), runner, "a", "b"]);
    expect(spawnMock.mock.calls[0]?.[2]).toMatchObject({ cwd: dir });
  });

  it("queryProject hands the runner a result file, parses it, and cleans it up", async () => {
    dir = makeProject();
    nextChildExits(0, (args) => writeFileSync(args.at(-1)!, JSON.stringify({ ok: [1, 2] })));

    await expect(queryProject(dir, "demo", "")).resolves.toEqual({ ok: [1, 2] });

    expect(existsSync(path.join(dir, ".telekit", "demo-result.json"))).toBe(false);
  });

  it("queryProject fails loudly when the runner fails or writes nothing", async () => {
    dir = makeProject();
    nextChildExits(2);
    await expect(queryProject(dir, "demo", "")).rejects.toThrow("demo: loyiha skripti 2 kodi bilan tugadi");

    nextChildExits(0);
    await expect(queryProject(dir, "demo", "")).rejects.toThrow("demo: loyiha skripti natija yozmadi");
  });
});
