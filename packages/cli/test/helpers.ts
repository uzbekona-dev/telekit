import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";

/** Stands in for the `ChildProcess` a mocked `spawn` returns — tests emit `exit`/`error` on it. */
export class FakeChild extends EventEmitter {
  readonly kill = vi.fn((_signal?: NodeJS.Signals) => true);
}

/** A throwaway project directory containing `files` (paths relative to it). */
export function makeProject(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "telekit-cli-"));
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(dir, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

export function removeProject(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** Captures `console.log`/`console.error` lines instead of printing them. */
export function captureConsole(): { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    err.push(args.join(" "));
  });
  return { out, err };
}

/** Commands load `.env` files into `process.env` — the returned function puts it back exactly as it was. */
export function snapshotEnv(): () => void {
  const saved = { ...process.env };
  return () => {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  };
}
