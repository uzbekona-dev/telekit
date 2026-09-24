import { createRequire } from "node:module";
import path from "node:path";

/**
 * Resolves a module the way the *user's project* would resolve it — not the
 * way the CLI's own install location would. Anchoring on the project's
 * package.json means this finds `tsx`/`typescript` correctly regardless of
 * whether they were hoisted by npm, isolated by pnpm, or installed globally
 * alongside a locally-linked CLI.
 */
export function resolveFromProject(cwd: string, specifier: string): string {
  const req = createRequire(path.join(cwd, "package.json"));
  return req.resolve(specifier);
}
