/** Telegram's published webhook source ranges (spec §14.5). */
export const TELEGRAM_IP_RANGES = ["149.154.160.0/20", "91.108.4.0/22"] as const;

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    result = (result << 8) + n;
  }
  return result >>> 0;
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [rangeIp, prefixStr] = cidr.split("/");
  const prefix = Number(prefixStr);
  const ipInt = ipv4ToInt(ip);
  const rangeInt = rangeIp ? ipv4ToInt(rangeIp) : null;
  if (ipInt === null || rangeInt === null || !Number.isInteger(prefix)) return false;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

/** True if `ip` (a raw IPv4 dotted-decimal address, e.g. from a socket's `remoteAddress`) falls in one of Telegram's published webhook ranges. */
export function isTelegramIp(ip: string, ranges: readonly string[] = TELEGRAM_IP_RANGES): boolean {
  // A `::ffff:`-prefixed IPv4-mapped IPv6 address is exactly what Node's `net`
  // module hands back for an IPv4 client on a dual-stack socket — strip the
  // prefix so the plain-IPv4 CIDR check above still matches.
  const normalized = ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
  return ranges.some((range) => ipInCidr(normalized, range));
}
