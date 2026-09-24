export type NestedMessages = { [key: string]: string | NestedMessages };

/** `{orders: {count: "..."}}` → `{"orders.count": "..."}` — matches `ctx.t("bot.orders.count")`'s dotted-key convention (spec §26.1). */
export function flattenMessages(nested: NestedMessages, prefix = ""): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(nested)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      flat[path] = value;
    } else {
      Object.assign(flat, flattenMessages(value, path));
    }
  }
  return flat;
}
