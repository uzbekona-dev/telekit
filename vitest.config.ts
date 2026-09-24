import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const packageSource = (file: string) => path.join(root, "packages", file);

/** Spec §28.5: core >= 85%, every other package >= 80% — enforced per package, not as one aggregate. */
const CORE_THRESHOLD = { statements: 85, branches: 85, functions: 85, lines: 85 };
const PACKAGE_THRESHOLD = { statements: 80, branches: 80, functions: 80, lines: 80 };
const OTHER_PACKAGES = ["callbacks", "cli", "conversations", "sessions", "testing", "types"];

export default defineConfig({
  resolve: {
    // Cross-package imports resolve to each package's TypeScript source, not
    // its built `dist/`: tests never depend on a stale build, and coverage is
    // attributed to the package whose code actually ran (e.g. core code
    // exercised by @telekit/testing's tests counts toward core).
    alias: [
      { find: /^@telekit\/testing\/vitest-setup$/, replacement: packageSource("testing/src/vitest-setup.ts") },
      { find: /^@telekit\/([a-z-]+)$/, replacement: packageSource("$1/src/index.ts") },
    ],
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      thresholds: {
        "packages/core/src/**": CORE_THRESHOLD,
        ...Object.fromEntries(OTHER_PACKAGES.map((name) => [`packages/${name}/src/**`, PACKAGE_THRESHOLD])),
      },
    },
  },
});
