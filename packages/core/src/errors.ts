export interface TelekitErrorOptions {
  cause?: unknown;
  context?: Record<string, unknown>;
  retryable?: boolean;
}

/**
 * Base of the Telekit error hierarchy (spec §20). Every subclass carries a
 * stable `TKxxxx` code so the same failure can be documented once at
 * telekit.dev/errors/<code> and looked up from any log line.
 */
export class TelekitError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly context?: Record<string, unknown>;

  constructor(code: string, message: string, options: TelekitErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.context = options.context;
  }
}

/** Startup-time misconfiguration. Bootstrap must not continue past this. */
export class ConfigurationError extends TelekitError {}

/** A field failed validation (command args, reply target, etc). */
export class ValidationError extends TelekitError {}

/** No command/event/callback matched an update. */
export class RouteNotFoundError extends TelekitError {}

/** Transport-level failure calling the Telegram API (timeout, DNS, etc). */
export class NetworkError extends TelekitError {}

/**
 * A Telegram Bot API call returned `ok: false`. Carries the raw error_code
 * and description so callers can branch on Telegram's own semantics
 * (403 blocked, 429 rate limited, ...) — see spec §18.2.
 */
export class TelegramApiError extends TelekitError {
  readonly method: string;
  readonly errorCode: number;
  readonly description: string;
  readonly retryAfter?: number;

  constructor(method: string, errorCode: number, description: string, retryAfter?: number) {
    // Telegram's error_code is always a 3-digit HTTP-style status (400, 401,
    // 429, 500, ...), so "TK11" + errorCode stays a stable, readable code
    // (TK11401, TK11429, ...) instead of losing information to truncation.
    super(
      `TK11${errorCode}`,
      `Telegram API "${method}" failed: ${errorCode} ${description}`,
      { retryable: errorCode === 429 || errorCode >= 500 },
    );
    this.method = method;
    this.errorCode = errorCode;
    this.description = description;
    this.retryAfter = retryAfter;
  }

  /** True when Telegram reports the user has blocked the bot (403). */
  get isBlockedByUser(): boolean {
    return this.errorCode === 403 && /blocked/i.test(this.description);
  }
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof TelekitError) {
    return {
      name: err.name,
      code: err.code,
      message: err.message,
      retryable: err.retryable,
      context: err.context,
      stack: err.stack,
    };
  }
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}
