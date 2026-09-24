/** The parts of a `@telekit/callbacks` `FieldDef` that decide its worst-case encoded size. */
export interface CallbackFieldInfo {
  kind: string;
  optional?: boolean;
  maxLength?: number;
  enumValues?: readonly string[];
}

export interface CallbackHandleInfo {
  name: string;
  routeId: string;
  fields: CallbackFieldInfo[];
}

/** What the `telekit routes` project runner collects from `app/callbacks/`. */
export interface RoutesData {
  /** `MAX_INLINE_PAYLOAD_BYTES` of the project's installed @telekit/callbacks. */
  budget: number;
  /** `createCallbackRegistry()`'s error message if two handles share a routeId, else `null`. */
  collision: string | null;
  handles: CallbackHandleInfo[];
}

export interface RoutesReport {
  lines: string[];
  exitCode: number;
}

function varintBytes(value: number): number {
  let rest = value;
  let bytes = 1;
  while (rest >= 0x80) {
    rest = Math.floor(rest / 0x80);
    bytes++;
  }
  return bytes;
}

/**
 * Worst-case bytes of one field in the ADR-003 binary layout: varints for
 * numbers/enum indexes, 16 raw bytes for a UUID, and a length-prefixed
 * UTF-8 string of up to 4 bytes per character. A `str()` with no
 * `maxLength` is unbounded — `Infinity`, i.e. it can always overflow.
 */
export function fieldMaxBytes(field: CallbackFieldInfo): number {
  switch (field.kind) {
    case "bool":
      return 1;
    case "uuid":
      return 16;
    case "uint":
    case "int":
      return 8; // a 53-bit safe integer as a (zigzag) varint
    case "enum":
      return varintBytes(Math.max(0, (field.enumValues?.length ?? 1) - 1));
    case "str":
      return field.maxLength === undefined ? Number.POSITIVE_INFINITY : varintBytes(field.maxLength) + field.maxLength * 4;
    default:
      return 0;
  }
}

/** One null-mask byte if any field is optional, plus every field at its worst case. */
export function estimateMaxPayloadBytes(fields: CallbackFieldInfo[]): number {
  const maskBytes = fields.some((f) => f.optional) ? 1 : 0;
  return fields.reduce((sum, field) => sum + fieldMaxBytes(field), maskBytes);
}

function formatBytes(bytes: number): string {
  return `${Number.isFinite(bytes) ? bytes : "∞"} B`;
}

/** `telekit routes` (spec §23.3, ADR-003): per-callback routeId/budget table plus the build-time collision check. */
export function buildRoutesReport(data: RoutesData): RoutesReport {
  if (data.handles.length === 0) {
    return { lines: ["app/callbacks/ ichida hech qanday defineCallback() topilmadi."], exitCode: 0 };
  }

  const lines = ["CALLBACKS".padEnd(34) + "routeId".padEnd(10) + "payload".padEnd(12) + "budjet".padEnd(9) + "holat"];
  let overflowCount = 0;
  for (const handle of [...data.handles].sort((a, b) => a.name.localeCompare(b.name))) {
    const maxBytes = estimateMaxPayloadBytes(handle.fields);
    const overflow = maxBytes > data.budget;
    if (overflow) overflowCount++;
    lines.push(
      handle.name.padEnd(34) +
        handle.routeId.padEnd(10) +
        formatBytes(maxBytes).padEnd(12) +
        formatBytes(data.budget).padEnd(9) +
        (overflow ? "⚠ overflow → ref store" : "✓"),
    );
  }

  lines.push("", `${data.handles.length} ta callback, ${overflowCount} tasi nazariy maksimalda budjetdan oshadi (ref store orqali ishlaydi).`);

  if (data.collision) {
    lines.push("", "✖ Callback ID collision", `  ${data.collision}`);
    return { lines, exitCode: 1 };
  }
  return { lines, exitCode: 0 };
}
