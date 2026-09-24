import { existsSync } from "node:fs";
import path from "node:path";
import { loadDotEnvCascade } from "../env-file.js";
import type { CommandOptions } from "./options.js";

type CheckStatus = true | false | "warn";

interface Check {
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface DoctorOptions extends CommandOptions {
  /** Injected in tests — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

const TELEGRAM_TIMEOUT_MS = 8000;

/** `engines.node` of every Telekit package: `>=22.13.0` (`node:sqlite`). */
export function isNodeVersionOk(version: string = process.versions.node): boolean {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 13);
}

/** `<bot id>:<secret>` as @BotFather issues it — catches pasted quotes, spaces and truncated tokens before any network call. */
export function isTokenFormatOk(token: string): boolean {
  return /^\d+:[A-Za-z0-9_-]{20,}$/.test(token);
}

async function checkTelegramConnection(token: string, fetchImpl: typeof fetch): Promise<Check> {
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
    const json = (await response.json()) as
      | { ok: true; result: { username: string } }
      | { ok: false; error_code: number; description: string };

    if (json.ok) {
      return { label: "Telegram getMe", status: true, detail: `@${json.result.username}` };
    }
    return { label: "Telegram getMe", status: false, detail: `${json.error_code} ${json.description}` };
  } catch (err) {
    return { label: "Telegram getMe", status: false, detail: String(err) };
  }
}

async function tokenChecks(token: string | undefined, fetchImpl: typeof fetch): Promise<Check[]> {
  if (!token) return [{ label: "BOT_TOKEN", status: "warn", detail: "o'rnatilmagan" }];
  if (!isTokenFormatOk(token)) return [{ label: "BOT_TOKEN format", status: false, detail: "noto'g'ri ko'rinadi" }];
  return [{ label: "BOT_TOKEN format", status: true }, await checkTelegramConnection(token, fetchImpl)];
}

/** Environment + project-shape diagnostics (spec §29.4, trimmed to what v0.1 actually has). */
export async function runDoctor(options: DoctorOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  loadDotEnvCascade(cwd);

  const nodeOk = isNodeVersionOk();
  const hasEnvFile = existsSync(path.join(cwd, ".env"));
  const checks: Check[] = [
    { label: `Node.js ${process.versions.node}`, status: nodeOk, detail: nodeOk ? undefined : "talab: >=22.13.0" },
    {
      label: ".env fayli",
      status: hasEnvFile ? true : "warn",
      detail: hasEnvFile ? undefined : "topilmadi — .env.example dan nusxa oling",
    },
    ...(await tokenChecks(process.env.BOT_TOKEN, options.fetchImpl ?? fetch)),
    { label: "main.ts", status: existsSync(path.join(cwd, "main.ts")) },
    { label: "telekit.config.ts", status: existsSync(path.join(cwd, "telekit.config.ts")) },
    { label: "app/commands/", status: existsSync(path.join(cwd, "app", "commands")) },
  ];

  let errors = 0;
  let warnings = 0;
  for (const check of checks) {
    const icon = check.status === true ? "✓" : check.status === "warn" ? "⚠" : "✗";
    if (check.status === false) errors++;
    if (check.status === "warn") warnings++;
    console.log(`${icon} ${check.label}${check.detail ? `  — ${check.detail}` : ""}`);
  }

  console.log(`\n${errors} ta xato, ${warnings} ta ogohlantirish.`);
  return errors > 0 ? 1 : 0;
}
