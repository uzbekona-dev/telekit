import { parseDuration, TelekitError, type Context, type Middleware } from "@telekit/core";
import type { SessionStore } from "./types.js";

export type SessionKeyStrategy = "user-chat" | "chat";

export interface SessionMiddlewareOptions {
  store: SessionStore;
  /** "user-chat" (default) scopes state per (chat, user); "chat" shares it across everyone in the chat. */
  key?: SessionKeyStrategy;
  /** e.g. "30d". Omit for no expiry. */
  ttl?: string;
}

export class SessionConflictError extends TelekitError {
  constructor(key: string) {
    super(
      "TK2301",
      `Session "${key}" boshqa so'rov tomonidan bir vaqtda yozildi (optimistik qulf mos kelmadi)`,
    );
  }
}

function deriveKey(ctx: Context, strategy: SessionKeyStrategy): string | null {
  if (!ctx.chat) return null;
  if (strategy === "chat") return `chat:${ctx.chat.id}`;
  if (!ctx.from) return null;
  return `user-chat:${ctx.chat.id}:${ctx.from.id}`;
}

type MutableContext = { -readonly [K in keyof Context]: Context[K] };

/**
 * Loads the session before the handler runs and persists it after, only if
 * something actually changed. Not truly lazy (spec §19.1's `lazy: true` is a
 * later optimization) — every update with a resolvable chat pays one read;
 * a write only happens when the handler mutated `ctx.session`.
 */
export function sessions(options: SessionMiddlewareOptions): Middleware {
  const keyStrategy = options.key ?? "user-chat";
  const ttlMs = options.ttl ? parseDuration(options.ttl) : null;

  return async (ctx, next) => {
    const key = deriveKey(ctx, keyStrategy);
    if (!key) {
      await next();
      return;
    }

    const record = await options.store.load(key);
    const data: Record<string, unknown> = record ? { ...record.data } : {};
    const before = JSON.stringify(data);
    const version = record?.version ?? 0;

    (ctx as MutableContext).session = data;

    await next();

    if (JSON.stringify(data) !== before) {
      const ok = await options.store.save(key, data, version, ttlMs);
      if (!ok) {
        throw new SessionConflictError(key);
      }
    }
  };
}
