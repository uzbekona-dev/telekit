import type { Message, User } from "@telekit/core";

/** One outgoing Bot API request as the fake backend saw it — every attempt, including failed/retried ones (spec §28.3 `res.apiCalls`). */
export interface ApiCall {
  method: string;
  params: Record<string, unknown>;
  ok: boolean;
  /** What the fake answered with, for successful calls — e.g. the `Message` a `sendMessage` created. */
  result?: unknown;
  error?: { error_code: number; description: string };
}

export type ApiCallListener = (call: ApiCall) => void;

export interface MockError {
  error_code: number;
  description?: string;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
}

export type MockResponse =
  | { result: unknown }
  | { error: MockError }
  | ((params: Record<string, unknown>) => { result: unknown } | { error: MockError });

export interface MockOptions {
  /** How many calls this mock answers before falling back to the default response. Defaults to 1 — so a mocked 429 is followed by a successful retry, as in spec §28.4. Pass `Infinity` for a permanent override. */
  times?: number;
}

interface MockEntry {
  method: string;
  response: MockResponse;
  remaining: number;
}

type ApiResponseBody =
  | { ok: true; result: unknown }
  | { ok: false; error_code: number; description: string; parameters?: MockError["parameters"] };

const DEFAULT_ERROR_DESCRIPTIONS: Record<number, string> = {
  400: "Bad Request",
  403: "Forbidden: bot was blocked by the user",
  404: "Not Found",
  429: "Too Many Requests",
  500: "Internal Server Error",
};

/**
 * In-process stand-in for `api.telegram.org`, plugged into `TelegramApi` via
 * its `fetchImpl` option. Records every call and answers with a plausible
 * default result unless a test queued a mock — so no test ever touches the
 * network (spec §28.1).
 */
export class FakeTelegram {
  readonly calls: ApiCall[] = [];
  private mocks: MockEntry[] = [];
  private files = new Map<string, Uint8Array>();
  private lastMessageIdByChat = new Map<number, number>();
  private listeners: ApiCallListener[] = [];
  private nextMessageId = 1;

  constructor(readonly botUser: User) {}

  /** Notified of every call as it happens — `createTestBot()` uses this to attribute calls to the update being handled. */
  observe(listener: ApiCallListener): void {
    this.listeners.push(listener);
  }

  /** Queues a response for the next `times` calls of `method` (spec §28.4). */
  mock(method: string, response: MockResponse, options: MockOptions = {}): void {
    this.mocks.push({ method, response, remaining: options.times ?? 1 });
  }

  /** Makes `getFile(fileId)` + `ctx.download(fileId)` resolve to `content` (spec §27.2). */
  registerFile(fileId: string, content: Uint8Array | string): void {
    this.files.set(fileId, typeof content === "string" ? new TextEncoder().encode(content) : content);
  }

  /** The id of the last message the bot sent to `chatId` — lets synthetic callback queries point at a real bot message. */
  lastMessageId(chatId: number): number | undefined {
    return this.lastMessageIdByChat.get(chatId);
  }

  clear(): void {
    this.calls.length = 0;
    this.mocks = [];
    this.files.clear();
    this.lastMessageIdByChat.clear();
  }

  readonly fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);

    const fileMatch = /\/file\/bot[^/]+\/(.+)$/.exec(url);
    if (fileMatch) return this.serveFile(fileMatch[1]!);

    const method = url.slice(url.lastIndexOf("/") + 1);
    const params = await parseBody(init?.body);
    const body = this.respond(method, params);

    const call: ApiCall = body.ok
      ? { method, params, ok: true, result: body.result }
      : { method, params, ok: false, error: { error_code: body.error_code, description: body.description } };
    this.calls.push(call);
    for (const listener of this.listeners) listener(call);
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  private serveFile(filePath: string): Response {
    const fileId = decodeURIComponent(filePath.replace(/^files\//, ""));
    const content = this.files.get(fileId);
    if (!content) return new Response("Not Found", { status: 404 });
    return new Response(content, { status: 200 });
  }

  private respond(method: string, params: Record<string, unknown>): ApiResponseBody {
    const mocked = this.takeMock(method);
    if (mocked) {
      const resolved = typeof mocked === "function" ? mocked(params) : mocked;
      if ("error" in resolved) {
        const { error_code, description, parameters } = resolved.error;
        return {
          ok: false,
          error_code,
          description: description ?? DEFAULT_ERROR_DESCRIPTIONS[error_code] ?? "Error",
          ...(parameters ? { parameters } : {}),
        };
      }
      return { ok: true, result: resolved.result };
    }
    return { ok: true, result: this.defaultResult(method, params) };
  }

  private takeMock(method: string): MockResponse | undefined {
    const entry = this.mocks.find((m) => m.method === method && m.remaining > 0);
    if (!entry) return undefined;
    entry.remaining--;
    if (entry.remaining <= 0) this.mocks = this.mocks.filter((m) => m !== entry);
    return entry.response;
  }

  private defaultResult(method: string, params: Record<string, unknown>): unknown {
    switch (method) {
      case "getMe":
        return this.botUser;
      case "getUpdates":
        return [];
      case "getWebhookInfo":
        return { url: "", has_custom_certificate: false, pending_update_count: 0 };
      case "getFile":
        return this.fileResult(String(params.file_id));
      case "sendMediaGroup":
        return (Array.isArray(params.media) ? params.media : []).map((item: { caption?: string }) =>
          this.sentMessage(params, { caption: item.caption }),
        );
      case "editMessageText":
      case "editMessageCaption":
      case "editMessageReplyMarkup":
        return params.inline_message_id ? true : this.editedMessage(params);
      default:
        if (method.startsWith("send") && method !== "sendChatAction") return this.sentMessage(params);
        return true;
    }
  }

  private fileResult(fileId: string) {
    const size = this.files.get(fileId)?.byteLength ?? 0;
    return { file_id: fileId, file_unique_id: `u_${fileId}`, file_size: size, file_path: `files/${encodeURIComponent(fileId)}` };
  }

  private sentMessage(params: Record<string, unknown>, overrides: Partial<Message> = {}): Message {
    const chatId = Number(params.chat_id);
    const messageId = this.nextMessageId++;
    this.lastMessageIdByChat.set(chatId, messageId);
    return {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: chatId < 0 ? "supergroup" : "private" },
      from: this.botUser,
      ...(typeof params.text === "string" ? { text: params.text } : {}),
      ...(typeof params.caption === "string" ? { caption: params.caption } : {}),
      ...overrides,
    };
  }

  private editedMessage(params: Record<string, unknown>): Message {
    const chatId = Number(params.chat_id);
    return {
      message_id: Number(params.message_id),
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: chatId < 0 ? "supergroup" : "private" },
      from: this.botUser,
      ...(typeof params.text === "string" ? { text: params.text } : {}),
      ...(typeof params.caption === "string" ? { caption: params.caption } : {}),
    };
  }
}

/** JSON bodies parse as-is; multipart bodies (file uploads) become a plain object, with file parts replaced by a `{ filename, size }` marker. */
async function parseBody(body: RequestInit["body"]): Promise<Record<string, unknown>> {
  if (typeof body === "string") return JSON.parse(body) as Record<string, unknown>;
  if (!(body instanceof FormData)) return {};

  const params: Record<string, unknown> = {};
  for (const [key, value] of body.entries()) {
    if (typeof value === "string") {
      params[key] = parseFormValue(key, value);
    } else {
      params[key] = { filename: value.name, size: value.size };
    }
  }
  return params;
}

/**
 * Telegram's multipart convention JSON-encodes non-string fields (see
 * `buildRequestInit` in core) — undo that for objects/arrays and `*_id`
 * numbers only, so a user-visible `text`/`caption` like "123" stays a string.
 */
function parseFormValue(key: string, value: string): unknown {
  const looksStructured = value.startsWith("{") || value.startsWith("[");
  const looksNumericId = key.endsWith("_id") && /^-?\d+$/.test(value);
  if (!looksStructured && !looksNumericId) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
