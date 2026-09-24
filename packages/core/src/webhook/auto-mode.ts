export type ResolvedMode = "polling" | "webhook";

export interface AutoModeWarning {
  code: "TK1030" | "TK1031" | "TK1032";
  message: string;
}

export interface AutoModeResult {
  mode: ResolvedMode;
  /** Startup-banner-visible (spec §14.7 — "nega webhook ishlamadi" is meant to be self-answering). */
  warnings: AutoModeWarning[];
}

export interface AutoModeInput {
  env: "development" | "production" | "test";
  publicUrl: string | null;
  /** Injected so tests never make a real network call — production code passes a real HEAD request with a 5s timeout. */
  checkUrlReachable: (url: string) => Promise<boolean>;
}

/** Implements the auto-mode decision tree (spec §14.7) exactly, including its three distinct warning codes. */
export async function resolveAutoMode(input: AutoModeInput): Promise<AutoModeResult> {
  if (input.env !== "production") {
    return { mode: "polling", warnings: [] };
  }

  if (!input.publicUrl) {
    return {
      mode: "polling",
      warnings: [{ code: "TK1030", message: "PUBLIC_URL yo'q — polling rejimiga o'tildi (webhook uchun PUBLIC_URL kerak)" }],
    };
  }

  if (!input.publicUrl.startsWith("https://")) {
    return {
      mode: "polling",
      warnings: [{ code: "TK1031", message: `PUBLIC_URL "${input.publicUrl}" https:// emas — polling rejimiga o'tildi` }],
    };
  }

  const reachable = await input.checkUrlReachable(input.publicUrl);
  if (!reachable) {
    return {
      mode: "polling",
      warnings: [{ code: "TK1032", message: `PUBLIC_URL "${input.publicUrl}" javob bermadi — polling rejimiga o'tildi` }],
    };
  }

  return { mode: "webhook", warnings: [] };
}

/** Real HEAD-request reachability check — 5s timeout (spec §14.7), any HTTP response (2xx–4xx) counts as reachable. */
export async function checkUrlReachableViaHead(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return response.status < 500;
  } catch {
    return false;
  }
}
