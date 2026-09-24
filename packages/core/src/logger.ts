export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const SECRET_KEY_PATTERN = /token|key|secret|password|authorization/i;

/**
 * Masks values whose key looks secret-shaped (spec §21.1). Bot tokens keep
 * their numeric id prefix visible (useful in debug output) — everything
 * after the colon is replaced.
 */
export function maskValue(key: string, value: unknown): unknown {
  if (typeof value !== "string" || !SECRET_KEY_PATTERN.test(key)) return value;
  if (value.length === 0) return value;
  const colon = value.indexOf(":");
  if (colon > 0) {
    return `${value.slice(0, colon + 1)}${"*".repeat(5)}`;
  }
  if (value.length <= 6) return "***";
  return `${value.slice(0, 4)}${"*".repeat(Math.min(5, value.length - 4))}`;
}

function maskDeep(value: unknown, parentKey = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => maskDeep(v, parentKey));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = typeof v === "object" && v !== null ? maskDeep(v, k) : maskValue(k, v);
    }
    return out;
  }
  return maskValue(parentKey, value);
}

export interface LogFields {
  [key: string]: unknown;
}

export interface Logger {
  trace(fields: LogFields, msg?: string): void;
  debug(fields: LogFields, msg?: string): void;
  info(fields: LogFields, msg?: string): void;
  warn(fields: LogFields, msg?: string): void;
  error(fields: LogFields, msg?: string): void;
  fatal(fields: LogFields, msg?: string): void;
  child(bindings: LogFields): Logger;
}

export interface LoggerOptions {
  level: LogLevel;
  pretty?: boolean;
  base?: LogFields;
  sink?: (line: string) => void;
}

const LEVEL_LABEL: Record<LogLevel, string> = {
  trace: "TRACE",
  debug: "DEBUG",
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
  fatal: "FATAL",
};

export function createLogger(options: LoggerOptions): Logger {
  const threshold = LEVEL_WEIGHT[options.level];
  const sink = options.sink ?? ((line: string) => process.stdout.write(line + "\n"));

  /** `fields` arrives pre-merged with all parent `child()` bindings. */
  function write(level: LogLevel, fields: LogFields, msg?: string): void {
    if (LEVEL_WEIGHT[level] < threshold) return;
    const masked = maskDeep(fields) as LogFields;

    if (options.pretty) {
      const rest = { ...masked };
      const event = rest.event;
      delete rest.event;
      const suffix = Object.keys(rest).length > 0 ? " " + JSON.stringify(rest) : "";
      const label = event ? `[${String(event)}] ` : "";
      sink(`${LEVEL_LABEL[level]} ${label}${msg ?? ""}${suffix}`);
      return;
    }

    sink(
      JSON.stringify({
        level,
        time: Date.now(),
        ...masked,
        ...(msg !== undefined ? { msg } : {}),
      }),
    );
  }

  function build(currentBase: LogFields): Logger {
    return {
      trace: (fields, msg) => write("trace", { ...currentBase, ...fields }, msg),
      debug: (fields, msg) => write("debug", { ...currentBase, ...fields }, msg),
      info: (fields, msg) => write("info", { ...currentBase, ...fields }, msg),
      warn: (fields, msg) => write("warn", { ...currentBase, ...fields }, msg),
      error: (fields, msg) => write("error", { ...currentBase, ...fields }, msg),
      fatal: (fields, msg) => write("fatal", { ...currentBase, ...fields }, msg),
      child: (bindings) => build({ ...currentBase, ...bindings }),
    };
  }

  return build(options.base ?? {});
}
