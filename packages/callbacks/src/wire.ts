import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { RouteNotFoundError, ValidationError } from "@telekit/core";
import { base64UrlDecode, base64UrlEncode } from "./base64url.js";
import { decodePayload, encodePayload, type CallbackSchema, type InferSchema } from "./schema.js";

export type CallbackScope = "global" | "user" | "chat";

/** Raw (undecoded) payload bytes over the 37-byte inline budget need the (not-yet-built) ref store — see ADR-003 §"Overflow". */
export const MAX_INLINE_PAYLOAD_BYTES = 37;

export class CallbackOverflowError extends ValidationError {
  constructor(name: string, actualBytes: number) {
    super(
      "TK2104",
      `Callback "${name}" payload'i ${actualBytes} bayt — ${MAX_INLINE_PAYLOAD_BYTES} baytlik chegaradan oshdi. ` +
        "Kichikroq schema ishlating (masalan str() o'rniga enum()/uint()) — ref store orqali overflow v0.2'da hali qo'llab-quvvatlanmaydi.",
    );
  }
}

export class CallbackSignatureError extends ValidationError {
  constructor() {
    super("TK2102", "Callback imzosi mos kelmadi — callback_data qo'lda o'zgartirilgan yoki eskirgan bo'lishi mumkin");
  }
}

export class CallbackDecodeError extends ValidationError {
  constructor(reason: string) {
    super("TK2101", `Callback ma'lumotini o'qib bo'lmadi: ${reason}`);
  }
}

/** 24-bit hash of the callback's name — stable across deploys regardless of registration order (spec ADR-003). */
export function computeRouteId(name: string): string {
  const hash = createHash("sha256").update(name).digest();
  return base64UrlEncode(hash).slice(0, 4);
}

function signatureInput(routeId: string, payload: Uint8Array, scope: CallbackScope, scopeId?: number): Buffer {
  const scopeSuffix = scope === "global" ? "" : `.${scope}.${scopeId ?? ""}`;
  return Buffer.concat([Buffer.from(routeId + "."), Buffer.from(payload), Buffer.from(scopeSuffix)]);
}

function computeSignature(key: Buffer, routeId: string, payload: Uint8Array, scope: CallbackScope, scopeId: number | undefined, sigBytes: number): string {
  const digest = createHmac("sha256", key).update(signatureInput(routeId, payload, scope, scopeId)).digest();
  return base64UrlEncode(digest.subarray(0, sigBytes));
}

/** Constant-time comparison — a `===` on attacker-influenced strings would leak timing information about the correct signature. */
function signaturesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface WireCallbackDefinition {
  name: string;
  routeId: string;
  scope: CallbackScope;
  schema: CallbackSchema;
}

export interface CodecOptions {
  key: Buffer;
  sigBytes: number;
  sign: boolean;
}

/**
 * Encodes a callback into the `<routeId>.<payload>.<sig>` wire format
 * (ADR-003). `scopeId` is the `from.id`/`chat.id` the button is being shown
 * to — required whenever `def.scope !== "global"` so a signature computed
 * for one user can never validate for another.
 */
export function encodeCallback(def: WireCallbackDefinition, data: Record<string, unknown>, options: CodecOptions, scopeId?: number): string {
  if (def.scope !== "global" && scopeId === undefined) {
    throw new ValidationError(
      "TK2001",
      `Callback "${def.name}" scope="${def.scope}" — uni chaqirishda scopeId (from.id yoki chat.id) berilishi shart`,
    );
  }

  const payload = encodePayload(def.schema, data);
  if (payload.length > MAX_INLINE_PAYLOAD_BYTES) {
    throw new CallbackOverflowError(def.name, payload.length);
  }

  const payloadB64 = base64UrlEncode(payload);
  if (!options.sign) {
    return `${def.routeId}.${payloadB64}.`;
  }
  const sig = computeSignature(options.key, def.routeId, payload, def.scope, scopeId, options.sigBytes);
  return `${def.routeId}.${payloadB64}.${sig}`;
}

export interface DecodedCallback<TSchema extends CallbackSchema> {
  data: InferSchema<TSchema>;
}

export interface VerifyContext {
  fromId?: number;
  chatId?: number;
}

/** Looks up a definition by the wire format's routeId segment — the registry owns the actual `Map`. */
export type RouteIdLookup = (routeId: string) => WireCallbackDefinition | undefined;

export function decodeCallback(
  raw: string,
  lookup: RouteIdLookup,
  verify: VerifyContext,
  options: CodecOptions,
): { def: WireCallbackDefinition; data: Record<string, unknown> } {
  const parts = raw.split(".");
  if (parts.length !== 3) throw new CallbackDecodeError(`format noto'g'ri: "${raw}"`);
  const [routeId, payloadB64, sig] = parts as [string, string, string];

  const def = lookup(routeId);
  if (!def) throw new RouteNotFoundError("TK2103", `routeId "${routeId}" uchun callback topilmadi (eskirgan tugma)`);

  let payload: Uint8Array;
  try {
    payload = base64UrlDecode(payloadB64);
  } catch (err) {
    throw new CallbackDecodeError(`payload base64url emas: ${String(err)}`);
  }

  if (options.sign) {
    const scopeId = def.scope === "user" ? verify.fromId : def.scope === "chat" ? verify.chatId : undefined;
    const expected = computeSignature(options.key, routeId, payload, def.scope, scopeId, options.sigBytes);
    if (!signaturesMatch(sig, expected)) throw new CallbackSignatureError();
  }

  const data = decodePayload(def.schema, payload);
  return { def, data };
}
