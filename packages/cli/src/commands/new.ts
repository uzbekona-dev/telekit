import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import type { CommandOptions } from "./options.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = path.resolve(__dirname, "../../templates");

const TEMPLATABLE_EXTENSIONS = new Set([".json", ".ts", ".md", ".example"]);

const AVAILABLE_TEMPLATES = ["minimal", "standard"] as const;
type TemplateName = (typeof AVAILABLE_TEMPLATES)[number];

const DEFAULT_PROJECT_NAME = "my-bot";

export interface NewOptions extends CommandOptions {
  /** Asks for the project name when none was given — injected in tests; defaults to an interactive stdin prompt. */
  prompt?: (question: string) => Promise<string>;
}

/** A valid npm package name from whatever the user typed: lowercase, `[a-z0-9-_]` only, no leading dashes. */
export function sanitizePackageName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/^-+/, "");
  return cleaned || DEFAULT_PROJECT_NAME;
}

async function stdinPrompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

function applyTemplateVars(dir: string, vars: Record<string, string>): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      applyTemplateVars(full, vars);
      continue;
    }
    if (!TEMPLATABLE_EXTENSIONS.has(path.extname(entry.name))) continue;

    const original = readFileSync(full, "utf8");
    const content = Object.entries(vars).reduce((text, [key, value]) => text.split(`__${key}__`).join(value), original);
    if (content !== original) writeFileSync(full, content, "utf8");
  }
}

/** Only the `--template=value` form is accepted (not a separate `--template value` pair) — that keeps parsing unambiguous against the positional project-name argument. */
export function parseTemplateFlag(argv: string[]): TemplateName {
  const flag = argv.find((a) => a.startsWith("--template="));
  if (!flag) return "minimal";

  const value = flag.slice("--template=".length);
  if (!AVAILABLE_TEMPLATES.includes(value as TemplateName)) {
    throw new Error(`Noma'lum shablon: "${value}". Mavjud: ${AVAILABLE_TEMPLATES.join(", ")}`);
  }
  return value as TemplateName;
}

/** `telekit new <name> [--template=minimal|standard]` (spec §29.1). */
export async function runNew(argv: string[], options: NewOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const template = parseTemplateFlag(argv);
  const requestedName = argv.find((a) => !a.startsWith("-"));
  const projectName = requestedName ?? ((await (options.prompt ?? stdinPrompt)("Loyiha nomi: ")).trim() || DEFAULT_PROJECT_NAME);
  const targetDir = path.resolve(cwd, projectName);

  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    console.error(`✖ "${projectName}" papkasi allaqachon mavjud va bo'sh emas.`);
    return 1;
  }

  const templateDir = path.join(TEMPLATES_ROOT, template);
  if (!existsSync(templateDir)) {
    throw new Error(`Shablon topilmadi: ${templateDir}`);
  }

  mkdirSync(targetDir, { recursive: true });
  cpSync(templateDir, targetDir, { recursive: true });
  applyTemplateVars(targetDir, { PROJECT_NAME: sanitizePackageName(projectName) });

  const envExample = path.join(targetDir, ".env.example");
  const envFile = path.join(targetDir, ".env");
  if (existsSync(envExample) && !existsSync(envFile)) {
    copyFileSync(envExample, envFile);
  }

  console.log(`
✓ Loyiha tayyor: ${projectName} (shablon: ${template})

  cd ${projectName}
  pnpm install          (yoki: npm install)
  .env ichiga BOT_TOKEN ni qo'ying   (@BotFather dan oling)
  pnpm dev
`);
  return 0;
}
