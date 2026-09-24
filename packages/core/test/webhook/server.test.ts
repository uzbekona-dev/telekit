import type { Update } from "@telekit/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebhookServer } from "../../src/webhook/server.js";

const PATH = "/telegram/webhook/secret-path-abc";
const SECRET = "correct-secret-token";

function baseHeaders(overrides: Record<string, string> = {}): Record<string, string> {
  return { "x-telegram-bot-api-secret-token": SECRET, "content-type": "application/json", ...overrides };
}

describe("WebhookServer", () => {
  let server: WebhookServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("delivers a valid POST to onUpdate and responds 200 (responseMode: immediate)", async () => {
    const onUpdate = vi.fn();
    server = new WebhookServer({ path: PATH, secretToken: SECRET, ipAllowlist: false, responseMode: "immediate", onUpdate });
    await server.listen(0);

    const update: Update = { update_id: 1 };
    const res = await fetch(`http://127.0.0.1:${server.port}${PATH}`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(update),
    });

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith(update));
  });

  it("waits for onUpdate to finish before responding (responseMode: await)", async () => {
    let handled = false;
    const onUpdate = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      handled = true;
    });
    server = new WebhookServer({ path: PATH, secretToken: SECRET, ipAllowlist: false, responseMode: "await", onUpdate });
    await server.listen(0);

    const res = await fetch(`http://127.0.0.1:${server.port}${PATH}`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ update_id: 2 }),
    });

    expect(res.status).toBe(200);
    expect(handled).toBe(true); // proves the response only landed after onUpdate resolved
  });

  it("returns 401 and skips onUpdate for a wrong secret token", async () => {
    const onUpdate = vi.fn();
    server = new WebhookServer({ path: PATH, secretToken: SECRET, ipAllowlist: false, responseMode: "immediate", onUpdate });
    await server.listen(0);

    const res = await fetch(`http://127.0.0.1:${server.port}${PATH}`, {
      method: "POST",
      headers: baseHeaders({ "x-telegram-bot-api-secret-token": "wrong" }),
      body: JSON.stringify({ update_id: 3 }),
    });

    expect(res.status).toBe(401);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("returns 401 when the secret token header is missing entirely", async () => {
    const onUpdate = vi.fn();
    server = new WebhookServer({ path: PATH, secretToken: SECRET, ipAllowlist: false, responseMode: "immediate", onUpdate });
    await server.listen(0);

    const res = await fetch(`http://127.0.0.1:${server.port}${PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ update_id: 4 }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 for a request to the wrong path", async () => {
    const onUpdate = vi.fn();
    server = new WebhookServer({ path: PATH, secretToken: SECRET, ipAllowlist: false, responseMode: "immediate", onUpdate });
    await server.listen(0);

    const res = await fetch(`http://127.0.0.1:${server.port}/wrong/path`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ update_id: 5 }),
    });

    expect(res.status).toBe(404);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that isn't valid JSON", async () => {
    const onUpdate = vi.fn();
    server = new WebhookServer({ path: PATH, secretToken: SECRET, ipAllowlist: false, responseMode: "immediate", onUpdate });
    await server.listen(0);

    const res = await fetch(`http://127.0.0.1:${server.port}${PATH}`, {
      method: "POST",
      headers: baseHeaders(),
      body: "{not valid json",
    });

    expect(res.status).toBe(400);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("returns 413 for a body over the configured max size", async () => {
    const onUpdate = vi.fn();
    server = new WebhookServer({
      path: PATH,
      secretToken: SECRET,
      ipAllowlist: false,
      responseMode: "immediate",
      maxBodyBytes: 10,
      onUpdate,
    });
    await server.listen(0);

    const res = await fetch(`http://127.0.0.1:${server.port}${PATH}`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ update_id: 6, extra: "way more than ten bytes of body" }),
    });

    expect(res.status).toBe(413);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("rejects a non-Telegram IP with 403 when ipAllowlist is enabled", async () => {
    const onUpdate = vi.fn();
    server = new WebhookServer({ path: PATH, secretToken: SECRET, ipAllowlist: true, responseMode: "immediate", onUpdate });
    await server.listen(0);

    // A request from the test runner itself (127.0.0.1) is not in Telegram's published ranges.
    const res = await fetch(`http://127.0.0.1:${server.port}${PATH}`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ update_id: 7 }),
    });

    expect(res.status).toBe(403);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("returns 429 under backpressure and 503 while draining", async () => {
    const onUpdate = vi.fn();
    let accepting = false;
    server = new WebhookServer({
      path: PATH,
      secretToken: SECRET,
      ipAllowlist: false,
      responseMode: "immediate",
      canAccept: () => accepting,
      onUpdate,
    });
    await server.listen(0);

    const url = `http://127.0.0.1:${server.port}${PATH}`;
    const busy = await fetch(url, { method: "POST", headers: baseHeaders(), body: JSON.stringify({ update_id: 8 }) });
    expect(busy.status).toBe(429);
    expect(busy.headers.get("retry-after")).toBe("1");

    accepting = true;
    server.setDraining();
    const draining = await fetch(url, { method: "POST", headers: baseHeaders(), body: JSON.stringify({ update_id: 9 }) });
    expect(draining.status).toBe(503);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
