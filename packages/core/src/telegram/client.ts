import type {
  ApiResponse,
  TelegramMethodName,
  TelegramMethods,
  UploadableFile,
} from "@telekit/types";
import { NetworkError, TelegramApiError } from "../errors.js";
import type { Logger } from "../logger.js";
import { type Clock, RealClock } from "../util/clock.js";

/** Duck-types `params` values against `UploadableFile` — `@telekit/core`'s `InputFile` (spec §27.1) satisfies this without `client.ts` importing it. */
export function isUploadableFile(value: unknown): value is UploadableFile {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toBlob?: unknown }).toBlob === "function"
  );
}

export interface RetryOptions {
  enabled: boolean;
  attempts: number;
  baseDelay: number;
  maxDelay: number;
}

export interface TelegramClientOptions {
  token: string;
  apiRoot?: string;
  timeout?: number;
  retry?: RetryOptions;
  logger?: Logger;
  fetchImpl?: typeof fetch;
  /** Time source for retry/backoff delays — defaults to `RealClock`. Tests inject a `VirtualClock` to advance past retry waits without actually waiting (spec §28.4). */
  clock?: Clock;
}

export interface CallOptions {
  signal?: AbortSignal;
  /** Overrides the client's default HTTP timeout for this call — `getUpdates` needs this to outlast its own long-poll `timeout` param. */
  timeoutMs?: number;
}

/**
 * Method/error combinations Telegram returns that retrying can never fix
 * (bad chat id, malformed request, ...). Retrying these just burns the
 * rate-limit budget for no benefit — see spec §18.2.
 */
function isRetryable(errorCode: number): boolean {
  return errorCode === 429 || errorCode >= 500;
}

/**
 * Thin, typed wrapper over the Telegram Bot API's HTTP surface. Owns retry
 * and timeout policy so every caller (polling, ctx.reply, ...) gets the
 * same resilience for free — see ADR-001 / spec §18.
 */
export class TelegramApi {
  private readonly token: string;
  private readonly apiRoot: string;
  private readonly timeout: number;
  private readonly retry: RetryOptions;
  private readonly logger?: Logger;
  private readonly fetchImpl: typeof fetch;
  readonly clock: Clock;

  constructor(options: TelegramClientOptions) {
    this.token = options.token;
    this.apiRoot = options.apiRoot ?? "https://api.telegram.org";
    this.timeout = options.timeout ?? 30_000;
    this.retry = options.retry ?? { enabled: true, attempts: 5, baseDelay: 300, maxDelay: 30_000 };
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.clock = options.clock ?? new RealClock();
  }

  async call<M extends TelegramMethodName>(
    method: M,
    params?: TelegramMethods[M]["params"],
    options: CallOptions = {},
  ): Promise<TelegramMethods[M]["result"]> {
    const url = `${this.apiRoot}/bot${this.token}/${method}`;
    const maxAttempts = this.retry.enabled ? this.retry.attempts : 1;

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started = Date.now();
      try {
        const response = await this.request<TelegramMethods[M]["result"]>(
          url,
          params,
          options.signal,
          options.timeoutMs,
        );
        const duration = Date.now() - started;

        if (response.ok) {
          this.logger?.debug(
            { event: "telegram.call", method, attempt, ok: true, duration_ms: duration },
            `Telegram ${method} OK`,
          );
          return response.result;
        }

        const { error_code, description, parameters } = response;
        this.logger?.warn(
          {
            event: "telegram.call",
            method,
            attempt,
            ok: false,
            duration_ms: duration,
            error_code,
            description,
          },
          `Telegram ${method} failed: ${error_code} ${description}`,
        );

        const apiError = new TelegramApiError(method, error_code, description, parameters?.retry_after);
        if (!this.retry.enabled || !isRetryable(error_code) || attempt === maxAttempts) {
          throw apiError;
        }

        const delay =
          error_code === 429 && parameters?.retry_after
            ? parameters.retry_after * 1000
            : this.backoffDelay(attempt);
        lastError = apiError;
        await this.clock.sleep(delay, options.signal);
        continue;
      } catch (err) {
        if (err instanceof TelegramApiError) throw err;
        if (options.signal?.aborted) throw err;

        lastError = err;
        this.logger?.warn(
          { event: "telegram.network_error", method, attempt, error: String(err) },
          `Telegram ${method} network xatosi (urinish ${attempt}/${maxAttempts})`,
        );
        if (!this.retry.enabled || attempt === maxAttempts) {
          throw new NetworkError("TK1201", `${method} uchun tarmoq xatosi: ${String(err)}`, {
            cause: err,
            retryable: true,
          });
        }
        await this.clock.sleep(this.backoffDelay(attempt), options.signal);
      }
    }

    // Unreachable in practice — the loop always returns or throws — but
    // keeps the return type honest for the compiler.
    throw lastError instanceof Error ? lastError : new NetworkError("TK1201", "Noma'lum tarmoq xatosi");
  }

  private backoffDelay(attempt: number): number {
    const exp = Math.min(this.retry.baseDelay * 2 ** (attempt - 1), this.retry.maxDelay);
    const jitter = Math.random() * exp * 0.2;
    return exp + jitter;
  }

  private async request<T>(
    url: string,
    params: unknown,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<ApiResponse<T>> {
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs ?? this.timeout);
    const combined = signal ? anySignal([signal, timeoutController.signal]) : timeoutController.signal;

    try {
      const response = await this.fetchImpl(url, await buildRequestInit(params, combined));
      return (await response.json()) as ApiResponse<T>;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Typed convenience wrappers over `call` ────────────────

  getMe(options?: CallOptions) {
    return this.call("getMe", {}, options);
  }
  /**
   * `params.timeout` is Telegram's long-poll wait, in seconds — the HTTP
   * request must be allowed to sit open at least that long, or the client's
   * own (much shorter) default timeout aborts a perfectly healthy poll on
   * every single call. Buffered by the configured default timeout to leave
   * room for actual network latency on top of the long-poll wait itself.
   */
  getUpdates(params: TelegramMethods["getUpdates"]["params"], options: CallOptions = {}) {
    const pollTimeoutMs = (params.timeout ?? 0) * 1000;
    return this.call("getUpdates", params, {
      ...options,
      timeoutMs: options.timeoutMs ?? pollTimeoutMs + this.timeout,
    });
  }
  sendMessage(params: TelegramMethods["sendMessage"]["params"], options?: CallOptions) {
    return this.call("sendMessage", params, options);
  }
  editMessageText(params: TelegramMethods["editMessageText"]["params"], options?: CallOptions) {
    return this.call("editMessageText", params, options);
  }
  deleteMessage(params: TelegramMethods["deleteMessage"]["params"], options?: CallOptions) {
    return this.call("deleteMessage", params, options);
  }
  answerCallbackQuery(params: TelegramMethods["answerCallbackQuery"]["params"], options?: CallOptions) {
    return this.call("answerCallbackQuery", params, options);
  }
  setMyCommands(params: TelegramMethods["setMyCommands"]["params"], options?: CallOptions) {
    return this.call("setMyCommands", params, options);
  }
  getMyCommands(params: TelegramMethods["getMyCommands"]["params"] = {}, options?: CallOptions) {
    return this.call("getMyCommands", params, options);
  }
  setWebhook(params: TelegramMethods["setWebhook"]["params"], options?: CallOptions) {
    return this.call("setWebhook", params, options);
  }
  deleteWebhook(params: TelegramMethods["deleteWebhook"]["params"] = {}, options?: CallOptions) {
    return this.call("deleteWebhook", params, options);
  }
  getWebhookInfo(options?: CallOptions) {
    return this.call("getWebhookInfo", {}, options);
  }
  sendPhoto(params: TelegramMethods["sendPhoto"]["params"], options?: CallOptions) {
    return this.call("sendPhoto", params, options);
  }
  sendDocument(params: TelegramMethods["sendDocument"]["params"], options?: CallOptions) {
    return this.call("sendDocument", params, options);
  }
  sendVideo(params: TelegramMethods["sendVideo"]["params"], options?: CallOptions) {
    return this.call("sendVideo", params, options);
  }
  sendAudio(params: TelegramMethods["sendAudio"]["params"], options?: CallOptions) {
    return this.call("sendAudio", params, options);
  }
  sendMediaGroup(params: TelegramMethods["sendMediaGroup"]["params"], options?: CallOptions) {
    return this.call("sendMediaGroup", params, options);
  }
  getFile(params: TelegramMethods["getFile"]["params"], options?: CallOptions) {
    return this.call("getFile", params, options);
  }
  editMessageCaption(params: TelegramMethods["editMessageCaption"]["params"], options?: CallOptions) {
    return this.call("editMessageCaption", params, options);
  }
  answerInlineQuery(params: TelegramMethods["answerInlineQuery"]["params"], options?: CallOptions) {
    return this.call("answerInlineQuery", params, options);
  }

  /**
   * Escape hatch for Bot API methods not yet in `TelegramMethods` (spec
   * §18.1) — still gets retry/timeout/logging, just no compile-time param
   * or result typing.
   */
  raw<T = unknown>(method: string, params?: Record<string, unknown>, options?: CallOptions): Promise<T> {
    return this.call(method as TelegramMethodName, params as never, options) as Promise<T>;
  }

  /**
   * Fetches a file's raw bytes from Telegram's file server using the
   * `file_path` a prior `getFile` call returned (spec §27.2). Lives here
   * (not in `media/download.ts`) because building the URL needs the bot
   * token, which the client otherwise never exposes.
   */
  async downloadFile(filePath: string, options: CallOptions = {}): Promise<Response> {
    const url = `${this.apiRoot}/file/bot${this.token}/${filePath}`;
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), options.timeoutMs ?? this.timeout);
    const combined = options.signal
      ? anySignal([options.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await this.fetchImpl(url, { signal: combined });
      if (!response.ok) {
        throw new NetworkError("TK1202", `Fayl yuklab olinmadi: HTTP ${response.status}`);
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Builds the fetch `RequestInit` for a call. Params with no `UploadableFile`
 * values (the common case) stay JSON. If any top-level value is an
 * `UploadableFile`, the request switches to `multipart/form-data`: file
 * fields become form parts named after their param key; every other field
 * is JSON-encoded per Telegram's multipart convention. `content-type` is
 * left unset for multipart so `fetch` generates the correct boundary itself.
 */
async function buildRequestInit(params: unknown, signal: AbortSignal): Promise<RequestInit> {
  const entries =
    params && typeof params === "object" ? Object.entries(params as Record<string, unknown>) : [];
  const hasUpload = entries.some(([, value]) => isUploadableFile(value));

  if (!hasUpload) {
    return {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params ?? {}),
      signal,
    };
  }

  const form = new FormData();
  for (const [key, value] of entries) {
    if (isUploadableFile(value)) {
      const blob = await value.toBlob();
      form.append(key, blob, value.filename ?? key);
    } else if (typeof value === "string") {
      form.append(key, value);
    } else if (value !== undefined) {
      form.append(key, JSON.stringify(value));
    }
  }
  return { method: "POST", body: form, signal };
}

/** Node has no built-in AbortSignal.any() until 20.3 — polyfilled inline for portability. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}
