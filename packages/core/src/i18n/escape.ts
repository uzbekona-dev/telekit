/** Marks a string as pre-approved HTML — `translate()` passes it through unescaped (spec §26.5). */
export class RawHtml {
  constructor(readonly value: string) {}
}

/** Opts a trusted value out of `t()`'s automatic HTML-escaping: `ctx.t("key", { link: raw("<a href=...>") })`. */
export function raw(value: string): RawHtml {
  return new RawHtml(value);
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]!);
}

/**
 * Every interpolated `t()` param is escaped unless wrapped in `raw()` —
 * bot replies commonly render as HTML, so an unescaped `{name}` would let a
 * user's own display name inject markup into every reply that greets them
 * (spec §26.5).
 */
export function escapeParams(params: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!params) return params;
  const escaped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value instanceof RawHtml) {
      escaped[key] = value.value;
    } else if (typeof value === "string") {
      escaped[key] = escapeHtml(value);
    } else {
      escaped[key] = value;
    }
  }
  return escaped;
}
