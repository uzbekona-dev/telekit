import { compose, NOOP_CALLBACK_DATA, RouteNotFoundError, type Context, type Middleware } from "@telekit/core";
import { bindCallbackCodec, type CallbackHandle } from "./callback.js";
import { REF_PREFIX, type CallbackRefStore } from "./ref-store.js";
import { createCallbackRegistry } from "./registry.js";
import { decodePayload } from "./schema.js";
import { CallbackDecodeError, CallbackSignatureError, decodeCallback, type CodecOptions } from "./wire.js";

export interface InstallCallbacksOptions {
  /** Signing key — `resolveAppKey(config)` (spec §40.2). */
  key: Buffer;
  /** HMAC tag length in bytes — defaults to `config.callbacks.sigBytes` (6). */
  sigBytes?: number;
  /** Set false only in development — `defineConfig` already rejects it in production (spec ADR-003 "Imzosiz rejim"). */
  sign?: boolean;
  /** Shown via `answerCallbackQuery` for an unrecognized/tampered/expired button. Defaults to a Uzbek message (spec "Eskirgan tugmalar"). */
  staleButtonText?: string;
  /** Enables `handle.encodeRef()`-produced `"!"`-prefixed callback_data to resolve back to a handle (ADR-003 "Overflow"). Omit to reject ref-style callback_data outright. */
  refStore?: CallbackRefStore;
}

const DEFAULT_STALE_TEXT = "Bu tugma eskirgan yoki endi mavjud emas";

function isRejectableDecodeError(err: unknown): err is RouteNotFoundError | CallbackSignatureError | CallbackDecodeError {
  return err instanceof RouteNotFoundError || err instanceof CallbackSignatureError || err instanceof CallbackDecodeError;
}

/**
 * Binds every given `defineCallback` handle to the signing key (so calling
 * one inside a handler encodes real `callback_data`), builds the routeId →
 * handle registry, and returns the middleware that dispatches an incoming
 * `callback_query` to the right handle. Install once at startup, before any
 * handler runs:
 *
 * ```ts
 * app.use(installCallbacks([deleteUser, ...], { key: resolveAppKey(config) }));
 * ```
 */
export function installCallbacks(handles: CallbackHandle<any>[], options: InstallCallbacksOptions): Middleware {
  const codec: CodecOptions = {
    key: options.key,
    sigBytes: options.sigBytes ?? 6,
    sign: options.sign ?? true,
  };
  for (const handle of handles) bindCallbackCodec(handle, codec);

  const registry = createCallbackRegistry(handles);
  const staleText = options.staleButtonText ?? DEFAULT_STALE_TEXT;

  async function dispatchRef(raw: string, ctx: Context): Promise<void> {
    if (!options.refStore) throw new CallbackDecodeError("ref store o'rnatilmagan");

    const refId = raw.slice(REF_PREFIX.length);
    const record = await options.refStore.load(refId);
    if (!record) throw new RouteNotFoundError("TK2105", `ref "${refId}" topilmadi yoki muddati tugagan`);

    const handle = registry.resolve(record.route);
    if (!handle) throw new RouteNotFoundError("TK2103", `routeId "${record.route}" uchun callback topilmadi`);

    if (handle.scope === "user" && record.userId !== ctx.from?.id) throw new CallbackSignatureError();
    if (handle.scope === "chat" && record.chatId !== ctx.chat?.id) throw new CallbackSignatureError();

    const data = decodePayload(handle.schema, record.payload);
    await compose(handle.middleware, ctx, () => handle.handle(ctx, data));
  }

  return async (ctx, next) => {
    const raw = ctx.callback?.data;
    if (!raw) {
      await next();
      return;
    }

    if (raw === NOOP_CALLBACK_DATA) {
      await ctx.answerCallback().catch(() => {});
      return;
    }

    try {
      if (raw.startsWith(REF_PREFIX)) {
        await dispatchRef(raw, ctx);
        return;
      }

      const { def, data } = decodeCallback(
        raw,
        (routeId) => registry.resolve(routeId),
        { fromId: ctx.from?.id, chatId: ctx.chat?.id },
        codec,
      );
      const handle = def as CallbackHandle<any>;
      await compose(handle.middleware, ctx, () => handle.handle(ctx, data));
    } catch (err) {
      if (isRejectableDecodeError(err)) {
        ctx.log.warn({ event: "callback.rejected", code: err.code, message: err.message }, "Callback rad etildi");
        await ctx.answerCallback({ text: staleText, show_alert: true }).catch(() => {});
        return;
      }
      throw err;
    }
  };
}
