import { ConfigurationError, ValidationError, type Context, type Middleware } from "@telekit/core";
import { REF_PREFIX, type CallbackRefStore } from "./ref-store.js";
import { encodePayload, type CallbackSchema, type InferSchema } from "./schema.js";
import {
  computeRouteId,
  decodeCallback,
  encodeCallback,
  type CallbackScope,
  type CodecOptions,
  type VerifyContext,
  type WireCallbackDefinition,
} from "./wire.js";

export interface CallbackConfig<TSchema extends CallbackSchema = CallbackSchema> {
  name: string;
  /** "global" (default) | "user" | "chat" — who is allowed to press this button (ADR-003). */
  scope?: CallbackScope;
  schema: TSchema;
  middleware?: Middleware[];
  handle(ctx: Context, data: InferSchema<TSchema>): void | Promise<void>;
}

/**
 * What `defineCallback` returns: callable (spec §23.4 — `deleteUser({ userId: 12 })`
 * encodes a button's `callback_data`) while also carrying everything
 * `installCallbacks`' registry needs to dispatch an incoming press.
 */
export interface CallbackHandle<TSchema extends CallbackSchema = CallbackSchema> {
  (data: InferSchema<TSchema>, scopeId?: number): string;
  readonly name: string;
  readonly routeId: string;
  readonly scope: CallbackScope;
  readonly schema: TSchema;
  readonly middleware: Middleware[];
  handle(ctx: Context, data: InferSchema<TSchema>): void | Promise<void>;
  encode(data: InferSchema<TSchema>, scopeId?: number): string;
  decode(raw: string, verify?: VerifyContext): InferSchema<TSchema>;
  /**
   * For payloads over the 37-byte inline budget (ADR-003 "Overflow") — stores
   * the packed payload in `store` and returns the `"!" + refId` wire form
   * instead of throwing `CallbackOverflowError`. `ttlMs` defaults to 7 days.
   */
  encodeRef(store: CallbackRefStore, data: InferSchema<TSchema>, scopeId?: number, ttlMs?: number): Promise<string>;
}

/**
 * A handle can only encode/decode once `installCallbacks` has bound it to a
 * concrete signing key. Keyed by the handle object itself (not a shared
 * module-level singleton) so unrelated `installCallbacks` calls — e.g. two
 * Applications in the same test run — never leak a codec into each other.
 */
const codecByHandle = new WeakMap<CallbackHandle<any>, CodecOptions>();

export function bindCallbackCodec(handle: CallbackHandle<any>, codec: CodecOptions): void {
  codecByHandle.set(handle, codec);
}

function requireCodec(handle: CallbackHandle<any>): CodecOptions {
  const codec = codecByHandle.get(handle);
  if (!codec) {
    throw new ConfigurationError(
      "TK1005",
      `Callback "${handle.name}" ishlatilmoqchi, lekin installCallbacks() hali chaqirilmagan — ` +
        "callback fayllaridan foydalanishdan oldin main.ts'da installCallbacks() ni chaqiring",
    );
  }
  return codec;
}

const DEFAULT_REF_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Identity helper matching `defineCommand`/`defineEvent` (spec §15.4), except the return value is callable — see `CallbackHandle`. */
export function defineCallback<TSchema extends CallbackSchema>(
  config: CallbackConfig<TSchema>,
): CallbackHandle<TSchema> {
  const scope = config.scope ?? "global";
  const routeId = computeRouteId(config.name);
  const wireDef: WireCallbackDefinition = { name: config.name, routeId, scope, schema: config.schema };

  const fn = ((data: InferSchema<TSchema>, scopeId?: number) => encode(data, scopeId)) as CallbackHandle<TSchema>;

  function encode(data: InferSchema<TSchema>, scopeId?: number): string {
    return encodeCallback(wireDef, data, requireCodec(fn), scopeId);
  }

  function decode(raw: string, verify: VerifyContext = {}): InferSchema<TSchema> {
    const result = decodeCallback(raw, (id) => (id === routeId ? wireDef : undefined), verify, requireCodec(fn));
    return result.data as InferSchema<TSchema>;
  }

  async function encodeRef(
    store: CallbackRefStore,
    data: InferSchema<TSchema>,
    scopeId?: number,
    ttlMs: number = DEFAULT_REF_TTL_MS,
  ): Promise<string> {
    if (scope !== "global" && scopeId === undefined) {
      throw new ValidationError(
        "TK2001",
        `Callback "${config.name}" scope="${scope}" — encodeRef() uchun ham scopeId (from.id yoki chat.id) berilishi shart`,
      );
    }
    const payload = encodePayload(config.schema, data as Record<string, unknown>);
    const refId = await store.save(
      {
        route: routeId,
        payload,
        chatId: scope === "chat" ? scopeId : undefined,
        userId: scope === "user" ? scopeId : undefined,
      },
      ttlMs,
    );
    return `${REF_PREFIX}${refId}`;
  }

  Object.defineProperties(fn, {
    name: { value: config.name, enumerable: true },
    routeId: { value: routeId, enumerable: true },
    scope: { value: scope, enumerable: true },
    schema: { value: config.schema, enumerable: true },
    middleware: { value: config.middleware ?? [], enumerable: true },
    handle: { value: config.handle, enumerable: true },
    encode: { value: encode, enumerable: true },
    decode: { value: decode, enumerable: true },
    encodeRef: { value: encodeRef, enumerable: true },
  });

  return fn;
}
