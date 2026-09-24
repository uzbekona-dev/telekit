import { readFileSync } from "node:fs";
import { runBuild } from "./commands/build.js";
import { runDev } from "./commands/dev.js";
import { runDoctor } from "./commands/doctor.js";
import { runI18nCheck } from "./commands/i18n-check.js";
import { runMigrate } from "./commands/migrate.js";
import { runNew } from "./commands/new.js";
import { runRoutes } from "./commands/routes.js";
import { runStart } from "./commands/start.js";

/** Read from the CLI's own package.json (one level above both `src/` and `dist/`), so `--version` and `--help` can't drift from the release. */
export function cliVersion(): string {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  return manifest.version;
}

export function helpText(version: string = cliVersion()): string {
  return `Telekit CLI v${version}

Foydalanish:
  telekit new <name> [--template=minimal|standard]   yangi loyiha yaratish
  telekit dev             development server (fayl o'zgarishlarini kuzatadi, polling)
  telekit build           production build (dist/)
  telekit start           production'da ishga tushirish
  telekit doctor          muhitni tekshirish
  telekit migrate         kutilayotgan migratsiyalarni qo'llash
  telekit migrate:status  migratsiyalar holatini ko'rsatish
  telekit routes          callback routeId/budjet hisoboti va to'qnashuv tekshiruvi
  telekit i18n:check      tarjima kalitlari yetishmasligini tekshirish (--strict bilan CI uchun)

  telekit --version
  telekit --help
`;
}

/** Dispatches one CLI invocation (`argv` without `node`/script) and resolves with the process exit code. */
export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  switch (command) {
    case "new":
      return runNew(rest);
    case "dev":
      return runDev();
    case "build":
      return runBuild();
    case "start":
      return runStart();
    case "doctor":
      return runDoctor();
    case "migrate":
      return runMigrate("latest");
    case "migrate:status":
      return runMigrate("status");
    case "routes":
      return runRoutes();
    case "i18n:check":
      return runI18nCheck(rest);
    case "--version":
    case "-v":
      console.log(cliVersion());
      return 0;
    case undefined:
    case "--help":
    case "-h":
      console.log(helpText());
      return 0;
    default:
      console.error(`Noma'lum buyruq: "${command}"\n`);
      console.log(helpText());
      return 1;
  }
}
