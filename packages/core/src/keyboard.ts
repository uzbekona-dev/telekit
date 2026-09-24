import type { InlineKeyboardButton, InlineKeyboardMarkup } from "@telekit/types";
import { decorateButtonText } from "./keyboard-decorators.js";
import { ValidationError } from "./errors.js";

/** Telegram's hard per-button `callback_data` limit (spec ADR-003) — checked here as a safety net for hand-built data, not just what `defineCallback` produces. */
const MAX_CALLBACK_DATA_BYTES = 64;

export interface ButtonOptions {
  /** Key into `telekit.config.ts`'s `keyboards.decorators.styles` — a no-op unless decorators are enabled and the style exists (spec §24.4). */
  style?: string;
}

export const btn = {
  /** `data` is normally a `defineCallback` handle invoked with its payload, e.g. `btn.callback(t("menu.profile"), profileCb({}))` (spec §24.1). */
  callback(text: string, data: string, options?: ButtonOptions): InlineKeyboardButton {
    const bytes = Buffer.byteLength(data, "utf8");
    if (bytes > MAX_CALLBACK_DATA_BYTES) {
      throw new ValidationError(
        "TK2001",
        `callback_data "${data}" ${bytes} bayt — Telegramning ${MAX_CALLBACK_DATA_BYTES} baytlik chegarasidan oshdi`,
      );
    }
    return { text: decorateButtonText(text, options?.style), callback_data: data };
  },

  url(text: string, url: string, options?: ButtonOptions): InlineKeyboardButton {
    return { text: decorateButtonText(text, options?.style), url };
  },

  webApp(text: string, url: string, options?: ButtonOptions): InlineKeyboardButton {
    return { text: decorateButtonText(text, options?.style), web_app: { url } };
  },
};

export interface GridOptions<T> {
  columns: number;
  map: (item: T) => InlineKeyboardButton;
}

export interface AutoLayoutOptions<T> {
  /** Approximate row width budget, in characters of button text — a row wraps once adding the next button would exceed this. */
  maxWidth: number;
  /** Omit when `items` are already `InlineKeyboardButton`s. */
  map?: (item: T) => InlineKeyboardButton;
}

/**
 * Fluent builder for inline keyboards (spec §24.1). Structurally satisfies
 * `InlineKeyboardMarkup` itself, so the result of `.row(...)` chains can be
 * passed straight to `reply_markup` without an extra `.build()` step.
 */
export class InlineKeyboardBuilder implements InlineKeyboardMarkup {
  private readonly rows: InlineKeyboardButton[][] = [];

  row(...buttons: InlineKeyboardButton[]): this {
    this.rows.push(buttons);
    return this;
  }

  /** Chunks `items` into fixed-width rows of `columns` buttons each (spec §24.2). */
  grid<T>(items: readonly T[], options: GridOptions<T>): this {
    for (let i = 0; i < items.length; i += options.columns) {
      this.row(...items.slice(i, i + options.columns).map(options.map));
    }
    return this;
  }

  /** Packs buttons row by row up to `maxWidth` characters, wrapping like text (spec §24.2). */
  auto<T>(items: readonly T[], options: AutoLayoutOptions<T>): this {
    const toButton = options.map ?? ((item: T) => item as unknown as InlineKeyboardButton);
    let currentRow: InlineKeyboardButton[] = [];
    let currentWidth = 0;

    for (const item of items) {
      const button = toButton(item);
      if (currentRow.length > 0 && currentWidth + button.text.length > options.maxWidth) {
        this.row(...currentRow);
        currentRow = [];
        currentWidth = 0;
      }
      currentRow.push(button);
      currentWidth += button.text.length;
    }
    if (currentRow.length > 0) this.row(...currentRow);
    return this;
  }

  get inline_keyboard(): InlineKeyboardButton[][] {
    return this.rows.map((row) => [...row]);
  }

  /**
   * `JSON.stringify` (which every outgoing API call goes through) never
   * serializes accessors defined on a class prototype — only own, enumerable
   * data properties. Without this, `reply_markup` would go over the wire as
   * `{"rows": [...]}` instead of `{"inline_keyboard": [...]}`, and Telegram
   * silently drops a `reply_markup` it doesn't recognize.
   */
  toJSON(): InlineKeyboardMarkup {
    return { inline_keyboard: this.inline_keyboard };
  }
}

export function keyboard(): InlineKeyboardBuilder {
  return new InlineKeyboardBuilder();
}
