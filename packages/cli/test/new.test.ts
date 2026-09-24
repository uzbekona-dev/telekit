import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTemplateFlag, runNew, sanitizePackageName } from "../src/commands/new.js";
import { captureConsole, makeProject, removeProject } from "./helpers.js";

describe("telekit new", () => {
  let cwd: string;
  let console_: { out: string[]; err: string[] };

  beforeEach(() => {
    cwd = makeProject();
    console_ = captureConsole();
  });
  afterEach(() => {
    removeProject(cwd);
    vi.restoreAllMocks();
  });

  it("scaffolds the minimal template with the project name filled in and .env created", async () => {
    await expect(runNew(["My Bot!"], { cwd })).resolves.toBe(0);

    const project = path.join(cwd, "My Bot!");
    const manifest = JSON.parse(readFileSync(path.join(project, "package.json"), "utf8")) as { name: string };
    expect(manifest.name).toBe("my-bot-");
    expect(readFileSync(path.join(project, ".env"), "utf8")).toBe(readFileSync(path.join(project, ".env.example"), "utf8"));
    expect(existsSync(path.join(project, "app", "commands", "start.ts"))).toBe(true);
    expect(existsSync(path.join(project, "resources"))).toBe(false);
    expect(console_.out[0]).toContain("✓ Loyiha tayyor: My Bot! (shablon: minimal)");
  });

  it("scaffolds the standard template, leaving no unreplaced placeholders", async () => {
    await runNew(["shop", "--template=standard"], { cwd });

    const project = path.join(cwd, "shop");
    expect(existsSync(path.join(project, "app", "conversations", "register.ts"))).toBe(true);
    expect(existsSync(path.join(project, "app", "inline", "default.ts"))).toBe(true);
    for (const file of ["package.json", "telekit.config.ts", "README.md"]) {
      expect(readFileSync(path.join(project, file), "utf8")).not.toContain("__PROJECT_NAME__");
    }
  });

  it("asks for a name when none is given, defaulting to my-bot", async () => {
    const prompt = vi.fn(async () => "  sorovnoma  ");
    await runNew([], { cwd, prompt });
    expect(prompt).toHaveBeenCalledWith("Loyiha nomi: ");
    expect(existsSync(path.join(cwd, "sorovnoma", "main.ts"))).toBe(true);

    await runNew([], { cwd, prompt: async () => "" });
    expect(existsSync(path.join(cwd, "my-bot", "main.ts"))).toBe(true);
  });

  it("never overwrites a non-empty directory, but fills an empty one", async () => {
    mkdirSync(path.join(cwd, "taken"));
    writeFileSync(path.join(cwd, "taken", "keep.txt"), "mine");
    mkdirSync(path.join(cwd, "empty"));

    await expect(runNew(["taken"], { cwd })).resolves.toBe(1);
    expect(console_.err[0]).toContain('"taken" papkasi allaqachon mavjud');
    expect(existsSync(path.join(cwd, "taken", "main.ts"))).toBe(false);

    await expect(runNew(["empty"], { cwd })).resolves.toBe(0);
    expect(existsSync(path.join(cwd, "empty", "main.ts"))).toBe(true);
  });

  it("parses --template= and rejects unknown templates before touching disk", async () => {
    expect(parseTemplateFlag([])).toBe("minimal");
    expect(parseTemplateFlag(["x", "--template=standard"])).toBe("standard");
    expect(() => parseTemplateFlag(["--template=huge"])).toThrow('Noma\'lum shablon: "huge"');

    await expect(runNew(["x", "--template=huge"], { cwd })).rejects.toThrow("Noma'lum shablon");
    expect(existsSync(path.join(cwd, "x"))).toBe(false);
  });

  it("sanitizes package names", () => {
    expect(sanitizePackageName("  Hello World  ")).toBe("hello-world");
    expect(sanitizePackageName("--bot")).toBe("bot");
    expect(sanitizePackageName("Бот")).toBe("my-bot");
    expect(sanitizePackageName("Бот 2")).toBe("2");
    expect(sanitizePackageName("!!!")).toBe("my-bot");
  });
});
