import { btn, keyboard, type InlineKeyboardBuilder } from "./keyboard.js";

/**
 * `callback_data` for the disabled edge buttons of a `paginator()` at the
 * first/last page. Not a real route — `installCallbacks`' middleware
 * special-cases this exact string and just acknowledges the press, so a
 * disabled edge button never needs its own `defineCallback` (spec §24.3).
 */
export const NOOP_CALLBACK_DATA = "noop";

export interface PaginatorLabels {
  prev?: string;
  next?: string;
  /** Template containing the literal placeholders `{page}` and `{total}`. */
  counter?: string;
}

export interface PaginatorOptions {
  /** 1-indexed current page. */
  page: number;
  total: number;
  /** Builds the `callback_data` for jumping to `targetPage` — typically a `defineCallback` handle invocation. */
  callback: (targetPage: number) => string;
  labels?: PaginatorLabels;
}

const DEFAULT_LABELS: Required<PaginatorLabels> = { prev: "‹", next: "›", counter: "{page}/{total}" };

/** Standard `‹  page/total  ›` pagination row (spec §24.3) — usable directly as `reply_markup`. */
export function paginator(options: PaginatorOptions): InlineKeyboardBuilder {
  const labels = { ...DEFAULT_LABELS, ...options.labels };
  const counterText = labels.counter
    .replace("{page}", String(options.page))
    .replace("{total}", String(options.total));

  const prevButton =
    options.page > 1
      ? btn.callback(labels.prev, options.callback(options.page - 1))
      : btn.callback(labels.prev, NOOP_CALLBACK_DATA);
  const nextButton =
    options.page < options.total
      ? btn.callback(labels.next, options.callback(options.page + 1))
      : btn.callback(labels.next, NOOP_CALLBACK_DATA);
  const counterButton = btn.callback(counterText, NOOP_CALLBACK_DATA);

  return keyboard().row(prevButton, counterButton, nextButton);
}
