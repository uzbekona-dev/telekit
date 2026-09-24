/**
 * Text-only button decorators (spec §24.4). v1's docs promised `primary /
 * success / danger` as button *colors*, but the Bot API has no such field
 * for inline buttons — so a "style" here just prepends/appends plain text.
 * Configured once from `telekit.config.ts`'s `keyboards.decorators`
 * (`Application`'s constructor calls `configureKeyboardDecorators`), then
 * read by every `btn.callback/url/webApp` call — a process-wide setting,
 * not a per-request one, so a small module-level store (like `config.ts`'s
 * own `env()` collector) is the right amount of state here, not full DI.
 */
export interface KeyboardStyleDecorator {
  prefix?: string;
  suffix?: string;
}

export interface KeyboardDecoratorsConfig {
  enabled: boolean;
  styles: Record<string, KeyboardStyleDecorator>;
}

let activeDecorators: KeyboardDecoratorsConfig = { enabled: false, styles: {} };

export function configureKeyboardDecorators(config: KeyboardDecoratorsConfig): void {
  activeDecorators = config;
}

/** Unconfigured (or `enabled: false`) is a safe no-op — `style` is simply ignored, never an error. */
export function decorateButtonText(text: string, style: string | undefined): string {
  if (!style || !activeDecorators.enabled) return text;
  const decorator = activeDecorators.styles[style];
  if (!decorator) return text;
  return `${decorator.prefix ?? ""}${text}${decorator.suffix ?? ""}`;
}
