import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";

export interface RunNodeOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** Relay the first SIGINT/SIGTERM to the child — long-running `dev`/`start` get a graceful stop on Ctrl+C. */
  forwardSignals?: boolean;
}

/**
 * `tsx` is a dependency of @telekit/cli, not of the user's project — the
 * templates never list it. Resolve it relative to this CLI module's own
 * install location, not `cwd`: anchoring on the project finds it only by
 * hoisting accident, and fails outright under pnpm's strict node_modules
 * (spec §29.3's zero-extra-devDependency `telekit dev` depends on this).
 */
export function resolveTsxCli(): string {
  return createRequire(import.meta.url).resolve("tsx/cli");
}

const FORWARDED_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

/** Forwards each signal to `child` once; the returned function unsubscribes whatever hasn't fired. */
export function forwardSignals(child: Pick<ChildProcess, "kill">, target: NodeJS.EventEmitter = process): () => void {
  const handlers = FORWARDED_SIGNALS.map((signal) => {
    const handler = () => child.kill(signal);
    target.once(signal, handler);
    return [signal, handler] as const;
  });
  return () => {
    for (const [signal, handler] of handlers) target.off(signal, handler);
  };
}

/**
 * Runs `node <args>` with inherited stdio and resolves with its exit code. A
 * child killed by a signal reports `1` — never `0`, which would let e.g. a
 * killed `tsc` pass for a successful build.
 */
export function runNode(args: string[], options: RunNodeOptions): Promise<number> {
  const child = spawn(process.execPath, args, {
    cwd: options.cwd,
    stdio: "inherit",
    env: options.env ?? process.env,
  });
  const stopForwarding = options.forwardSignals ? forwardSignals(child) : () => {};

  return new Promise<number>((resolve, reject) => {
    child.once("error", (err) => {
      stopForwarding();
      reject(err);
    });
    child.once("exit", (code) => {
      stopForwarding();
      resolve(code ?? 1);
    });
  });
}
