import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isNodeVersionOk, isTokenFormatOk, runDoctor } from "../src/commands/doctor.js";
import { captureConsole, makeProject, removeProject, snapshotEnv } from "./helpers.js";

const VALID_TOKEN = "123456789:AAH-abcdefghijklmnopqrstuvwxyz";
const COMPLETE_PROJECT = {
  ".env": `BOT_TOKEN=${VALID_TOKEN}`,
  "main.ts": "",
  "telekit.config.ts": "",
  "app/commands/start.ts": "",
};

function fakeFetch(body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
}

describe("telekit doctor", () => {
  let dir: string;
  let restoreEnv: () => void;
  let console_: { out: string[]; err: string[] };

  beforeEach(() => {
    restoreEnv = snapshotEnv();
    delete process.env.BOT_TOKEN;
    console_ = captureConsole();
  });
  afterEach(() => {
    restoreEnv();
    removeProject(dir);
    vi.restoreAllMocks();
  });

  it("passes a complete project whose token reaches Telegram", async () => {
    dir = makeProject(COMPLETE_PROJECT);
    const fetchImpl = fakeFetch({ ok: true, result: { username: "my_bot" } });

    await expect(runDoctor({ cwd: dir, fetchImpl })).resolves.toBe(0);

    expect(fetchImpl).toHaveBeenCalledWith(`https://api.telegram.org/bot${VALID_TOKEN}/getMe`, expect.anything());
    expect(console_.out).toContain("✓ Telegram getMe  — @my_bot");
    expect(console_.out.at(-1)).toBe("\n0 ta xato, 0 ta ogohlantirish.");
  });

  it("fails when Telegram rejects the token or can't be reached", async () => {
    dir = makeProject(COMPLETE_PROJECT);

    await expect(runDoctor({ cwd: dir, fetchImpl: fakeFetch({ ok: false, error_code: 401, description: "Unauthorized" }) })).resolves.toBe(1);
    expect(console_.out).toContain("✗ Telegram getMe  — 401 Unauthorized");

    const offline = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    await expect(runDoctor({ cwd: dir, fetchImpl: offline })).resolves.toBe(1);
    expect(console_.out.some((line) => line.includes("ECONNREFUSED"))).toBe(true);
  });

  it("only warns about a missing .env and BOT_TOKEN, but fails on missing project files", async () => {
    dir = makeProject();
    const fetchImpl = fakeFetch({});

    await expect(runDoctor({ cwd: dir, fetchImpl })).resolves.toBe(1);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(console_.out).toContain("⚠ .env fayli  — topilmadi — .env.example dan nusxa oling");
    expect(console_.out).toContain("⚠ BOT_TOKEN  — o'rnatilmagan");
    expect(console_.out).toContain("✗ main.ts");
    expect(console_.out.at(-1)).toBe("\n3 ta xato, 2 ta ogohlantirish.");
  });

  it("flags a malformed token without calling Telegram", async () => {
    dir = makeProject({ ...COMPLETE_PROJECT, ".env": "BOT_TOKEN='123:short'" });
    const fetchImpl = fakeFetch({});

    await expect(runDoctor({ cwd: dir, fetchImpl })).resolves.toBe(1);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(console_.out).toContain("✗ BOT_TOKEN format  — noto'g'ri ko'rinadi");
  });

  it("checks the Node.js and token formats", () => {
    expect(isNodeVersionOk("22.13.0")).toBe(true);
    expect(isNodeVersionOk("24.0.0")).toBe(true);
    expect(isNodeVersionOk("22.12.9")).toBe(false);
    expect(isNodeVersionOk("20.11.0")).toBe(false);
    expect(isNodeVersionOk("18.19.0")).toBe(false);
    expect(isNodeVersionOk()).toBe(true);

    expect(isTokenFormatOk(VALID_TOKEN)).toBe(true);
    expect(isTokenFormatOk("123456789")).toBe(false);
    expect(isTokenFormatOk(` ${VALID_TOKEN}`)).toBe(false);
  });
});
