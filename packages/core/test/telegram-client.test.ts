import { describe, expect, it, vi } from "vitest";
import { NetworkError, TelegramApiError } from "../src/errors.js";
import { TelegramApi } from "../src/telegram/client.js";
import { VirtualClock } from "../src/util/clock.js";

function fakeResponse(body: unknown): Response {
  return { json: async () => body } as Response;
}

describe("TelegramApi.call", () => {
  it("returns result on a successful call without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ ok: true, result: { id: 1, username: "bot" } }));

    const api = new TelegramApi({ token: "123:abc", fetchImpl });
    const result = await api.getMe();

    expect(result).toEqual({ id: 1, username: "bot" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bot123:abc/getMe");
    expect(init.method).toBe("POST");
  });

  it("retries a 429 using the server's retry_after, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        fakeResponse({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 0 } }),
      )
      .mockResolvedValueOnce(fakeResponse({ ok: true, result: [] }));

    const api = new TelegramApi({
      token: "123:abc",
      fetchImpl,
      retry: { enabled: true, attempts: 3, baseDelay: 1, maxDelay: 10 },
    });

    const result = await api.getUpdates({});
    expect(result).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("honors a real retry_after via a VirtualClock without waiting real time (spec §28.4)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        fakeResponse({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 3 } }),
      )
      .mockResolvedValueOnce(fakeResponse({ ok: true, result: [] }));

    const clock = new VirtualClock();
    const api = new TelegramApi({
      token: "123:abc",
      fetchImpl,
      retry: { enabled: true, attempts: 3, baseDelay: 300, maxDelay: 30_000 },
      clock,
    });

    const resultPromise = api.getUpdates({});

    await clock.advance(3000);
    const result = await resultPromise;

    expect(result).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries 5xx with backoff, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ ok: false, error_code: 500, description: "Internal Server Error" }))
      .mockResolvedValueOnce(fakeResponse({ ok: false, error_code: 502, description: "Bad Gateway" }))
      .mockResolvedValueOnce(fakeResponse({ ok: true, result: { message_id: 1 } }));

    const api = new TelegramApi({
      token: "123:abc",
      fetchImpl,
      retry: { enabled: true, attempts: 5, baseDelay: 1, maxDelay: 5 },
    });

    const result = await api.sendMessage({ chat_id: 1, text: "hi" });
    expect(result).toEqual({ message_id: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("never retries a non-retryable 4xx", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeResponse({ ok: false, error_code: 400, description: "chat not found" }));

    const api = new TelegramApi({ token: "123:abc", fetchImpl });

    await expect(api.sendMessage({ chat_id: 999, text: "hi" })).rejects.toThrow(TelegramApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("exposes isBlockedByUser for a 403 blocked error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeResponse({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }));

    const api = new TelegramApi({ token: "123:abc", fetchImpl });

    try {
      await api.sendMessage({ chat_id: 1, text: "hi" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TelegramApiError);
      expect((err as TelegramApiError).isBlockedByUser).toBe(true);
    }
  });

  it("getUpdates outlives the client's default HTTP timeout for its own long-poll wait", async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal;
      return new Promise((resolve) => {
        setTimeout(() => resolve(fakeResponse({ ok: true, result: [] })), 35_000);
      });
    });

    const api = new TelegramApi({ token: "123:abc", timeout: 30_000, fetchImpl: fetchImpl as unknown as typeof fetch });
    const promise = api.getUpdates({ timeout: 50 });

    await vi.advanceTimersByTimeAsync(35_000);
    const result = await promise;

    expect(result).toEqual([]);
    expect(capturedSignal?.aborted).toBe(false);
    vi.useRealTimers();
  });

  it("wraps a transport failure as NetworkError after exhausting retries", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    const api = new TelegramApi({
      token: "123:abc",
      fetchImpl,
      retry: { enabled: true, attempts: 2, baseDelay: 1, maxDelay: 2 },
    });

    await expect(api.getMe()).rejects.toThrow(NetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("switches to multipart/form-data when a param is an UploadableFile", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeResponse({ ok: true, result: { message_id: 1, date: 0, chat: { id: 1, type: "private" } } }));
    const api = new TelegramApi({ token: "123:abc", fetchImpl });

    const fakeFile = { filename: "promo.jpg", toBlob: () => new Blob(["fake-bytes"], { type: "image/jpeg" }) };
    await api.sendPhoto({ chat_id: 1, photo: fakeFile, caption: "hi" });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("photo")).toBeInstanceOf(Blob);
    expect(form.get("caption")).toBe("hi");
    expect(form.get("chat_id")).toBe("1");
    // Left unset so `fetch` generates its own multipart boundary.
    expect((init.headers as Record<string, string> | undefined)?.["content-type"]).toBeUndefined();
  });

  it("keeps the JSON path for calls with no UploadableFile params", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ ok: true, result: [] }));
    const api = new TelegramApi({ token: "123:abc", fetchImpl });

    await api.sendMediaGroup({ chat_id: 1, media: [{ type: "photo", media: "attach://a" }] });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(typeof init.body).toBe("string");
  });

  it("extracts UploadableFile values nested inside media arrays", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ ok: true, result: [] }));
    const api = new TelegramApi({ token: "123:abc", fetchImpl });
    const file = { filename: "album.jpg", toBlob: () => new Blob(["album"], { type: "image/jpeg" }) };

    await api.sendMediaGroup({ chat_id: 1, media: [{ type: "photo", media: file }] });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    expect(JSON.parse(String(form.get("media")))).toEqual([{ type: "photo", media: "attach://file_1" }]);
    expect(form.get("file_1")).toBeInstanceOf(Blob);
  });

  it("raw() calls an arbitrary method name with the same retry/logging behavior", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ ok: true, result: { ok: true } }));
    const api = new TelegramApi({ token: "123:abc", fetchImpl });

    const result = await api.raw<{ ok: boolean }>("someFutureMethod", { foo: "bar" });

    expect(result).toEqual({ ok: true });
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bot123:abc/someFutureMethod");
  });

  it("types and calls methods outside Telekit's original hand-written subset", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ ok: true, result: true }));
    const api = new TelegramApi({ token: "123:abc", fetchImpl });

    const result = await api.call("banChatMember", { chat_id: 1, user_id: 2, revoke_messages: true });

    expect(result).toBe(true);
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith("/banChatMember")).toBe(true);
  });
});
