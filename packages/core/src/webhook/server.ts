import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Update } from "@telekit/types";
import type { Logger } from "../logger.js";
import { isTelegramIp } from "./ip-allowlist.js";
import { secretTokenMatches } from "./secret.js";

const SECRET_TOKEN_HEADER = "x-telegram-bot-api-secret-token";
const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB (spec §14.5)

export interface WebhookServerOptions {
  /** Full path Telegram POSTs to, e.g. `/telegram/webhook/<secretPath>` (spec §14.5). */
  path: string;
  secretToken: string;
  ipAllowlist: boolean;
  maxBodyBytes?: number;
  /** `"immediate"` (default): 200 right after parsing, handler runs after. `"await"`: 200 only once the handler finishes — required on serverless (spec §14.6). */
  responseMode: "immediate" | "await";
  onUpdate: (update: Update) => void | Promise<void>;
  /** Fast admission check used to return 429 before reading/enqueuing more work. */
  canAccept?: () => boolean;
  logger?: Logger;
}

function respond(res: ServerResponse, status: number, body = ""): void {
  res.writeHead(status, { "content-type": "text/plain" });
  res.end(body);
}

/** Minimal `node:http`-based webhook ingress (spec §14.5) — no framework dependency, mirroring the project's "no unnecessary runtime deps" stance (ADR-005). */
export class WebhookServer {
  private readonly server: Server;
  private draining = false;

  constructor(private readonly options: WebhookServerOptions) {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((err: unknown) => {
        this.options.logger?.error({ event: "webhook.internal_error", err: String(err) }, "Webhook ichki xatosi");
        if (!res.headersSent) respond(res, 500, "internal error");
      });
    });
  }

  listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, () => {
        this.server.removeListener("error", reject);
        resolve();
      });
    });
  }

  /** The actual bound port — useful with `listen(0)` (OS-assigned), e.g. in tests. `undefined` before `listen()` resolves. */
  get port(): number | undefined {
    const address = this.server.address();
    return address && typeof address === "object" ? address.port : undefined;
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  setDraining(): void {
    this.draining = true;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST" || req.url !== this.options.path) {
      respond(res, 404, "not found");
      return;
    }

    if (this.draining) {
      res.setHeader("retry-after", "1");
      respond(res, 503, "draining");
      return;
    }

    if (this.options.canAccept && !this.options.canAccept()) {
      res.setHeader("retry-after", "1");
      respond(res, 429, "busy");
      return;
    }

    if (this.options.ipAllowlist) {
      const remoteIp = req.socket.remoteAddress;
      if (!remoteIp || !isTelegramIp(remoteIp)) {
        this.options.logger?.warn({ event: "webhook.ip_rejected", ip: remoteIp }, "Ruxsat etilmagan IP");
        respond(res, 403, "forbidden");
        return;
      }
    }

    if (!secretTokenMatches(req.headers[SECRET_TOKEN_HEADER] as string | undefined, this.options.secretToken)) {
      this.options.logger?.warn({ event: "webhook.secret_mismatch" }, "Secret token mos kelmadi");
      respond(res, 401, "unauthorized");
      return;
    }

    const maxBytes = this.options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    const contentLength = Number(req.headers["content-length"] ?? 0);
    if (contentLength > maxBytes) {
      respond(res, 413, "payload too large");
      return;
    }

    const body = await this.readBody(req, res, maxBytes);
    if (body === null) return; // readBody already responded (413 mid-stream)

    let update: Update;
    try {
      update = JSON.parse(body) as Update;
    } catch {
      respond(res, 400, "bad request");
      return;
    }

    if (this.options.responseMode === "await") {
      await this.options.onUpdate(update);
      respond(res, 200, "ok");
      return;
    }

    respond(res, 200, "ok");
    Promise.resolve(this.options.onUpdate(update)).catch((err: unknown) => {
      this.options.logger?.error({ event: "webhook.handler_error", err: String(err) }, "Webhook handler xatosi");
    });
  }

  /** Returns `null` (having already responded 413) if the body exceeds `maxBytes` — checked while streaming, not just via a spoofable Content-Length header. */
  private readBody(req: IncomingMessage, res: ServerResponse, maxBytes: number): Promise<string | null> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let total = 0;
      let rejected = false;

      req.on("data", (chunk: Buffer) => {
        if (rejected) return;
        total += chunk.length;
        if (total > maxBytes) {
          rejected = true;
          respond(res, 413, "payload too large");
          req.destroy();
          resolve(null);
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        if (!rejected) resolve(Buffer.concat(chunks).toString("utf8"));
      });

      req.on("error", () => {
        if (!rejected) resolve(null);
      });
    });
  }
}
