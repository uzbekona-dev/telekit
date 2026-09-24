import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureConsole } from "./helpers.js";

const mainMock = vi.hoisted(() => vi.fn<(argv: string[]) => Promise<number>>());
vi.mock("../src/main.js", () => ({ main: mainMock }));

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("bin entry", () => {
  const savedArgv = process.argv;
  const savedExitCode = process.exitCode;
  let console_: { out: string[]; err: string[] };

  beforeEach(() => {
    vi.resetModules();
    mainMock.mockReset();
    console_ = captureConsole();
  });
  afterEach(() => {
    process.argv = savedArgv;
    process.exitCode = savedExitCode;
    vi.restoreAllMocks();
  });

  it("passes the arguments after the script to main() and exits with its code", async () => {
    process.argv = ["node", "telekit", "routes", "--x"];
    mainMock.mockResolvedValue(7);

    await import("../src/bin.js");
    await settle();

    expect(mainMock).toHaveBeenCalledWith(["routes", "--x"]);
    expect(process.exitCode).toBe(7);
  });

  it("prints a thrown error's message (not its stack) and exits with 1", async () => {
    process.argv = ["node", "telekit", "build"];
    mainMock.mockRejectedValue(new Error("tsconfig.json topilmadi"));

    await import("../src/bin.js");
    await settle();

    expect(console_.err).toEqual(["tsconfig.json topilmadi"]);
    expect(process.exitCode).toBe(1);
  });

  it("stringifies non-Error rejections", async () => {
    process.argv = ["node", "telekit"];
    mainMock.mockRejectedValue("oddiy satr");

    await import("../src/bin.js");
    await settle();

    expect(console_.err).toEqual(["oddiy satr"]);
  });
});
