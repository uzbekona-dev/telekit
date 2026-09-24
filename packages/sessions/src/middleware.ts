import { parseDuration, TelekitError, type Context, type Middleware } from "@telekit/core";
import type { SessionStore } from "./types.js";

export type SessionKeyStrategy = "user-chat" | "chat";

export interface SessionMiddlewareOptions {
  store: SessionStore;
  /** "user-chat" (default) scopes state per (chat, user); "chat" shares it across everyone in the chat. */
  key?: SessionKeyStrategy;
  /** e.g. "30d". Omit for no expiry. */
  ttl?: string;
  /** Maximum serialized session size. Defaults to 64 KiB. */
  maxBytes?: number;
  /** Optimistic-lock retries after the first write. Defaults to 1. */
  conflictRetries?: number;
}

export class SessionConflictError extends TelekitError {
  constructor(key: string) {
    super(
      "TK2301",
      `Session "${key}" boshqa so'rov tomonidan bir vaqtda yozildi (optimistik qulf mos kelmadi)`,
    );
  }
}

export class SessionTooLargeError extends TelekitError {
  constructor(key: string, actualBytes: number, maxBytes: number) {
    super("TK2302", `Session "${key}" ${actualBytes} bayt — ruxsat etilgan maksimum ${maxBytes} bayt`);
  }
}

function changedTopLevelKeys(before: Record<string, unknown>, after: Record<string, unknown>): Set<string> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return new Set([...keys].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])));
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
  const maxBytes = options.maxBytes ?? 64 * 1024;
  const conflictRetries = options.conflictRetries ?? 1;

  return async (ctx, next) => {
    const key = deriveKey(ctx, keyStrategy);
    if (!key) {
      await next();
      return;
    }

    const record = await options.store.load(key);
    const data: Record<string, unknown> = record ? structuredClone(record.data) : {};
    const beforeData = structuredClone(data);
    const before = JSON.stringify(data);

    (ctx as MutableContext).session = data;

    await next();

    if (JSON.stringify(data) !== before) {
      const changedKeys = changedTopLevelKeys(beforeData, data);
      let candidate = data;
      let version = record?.version ?? 0;

      for (let attempt = 0; attempt <= conflictRetries; attempt++) {
        const bytes = Buffer.byteLength(JSON.stringify(candidate), "utf8");
        if (bytes > maxBytes) throw new SessionTooLargeError(key, bytes, maxBytes);
        if (await options.store.save(key, candidate, version, ttlMs)) return;
        if (attempt === conflictRetries) throw new SessionConflictError(key);

        const latest = await options.store.load(key);
        candidate = latest ? structuredClone(latest.data) : {};
        version = latest?.version ?? 0;
        for (const changedKey of changedKeys) {
          if (Object.hasOwn(data, changedKey)) candidate[changedKey] = structuredClone(data[changedKey]);
          else delete candidate[changedKey];
        }
      }
    }
  };
}
