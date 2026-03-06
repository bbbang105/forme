/**
 * SSRF protection: validate URLs before server-side fetch
 */
export function isSafeUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  // Strip brackets from IPv6 hostname (URL parser wraps IPv6 in [])
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Normalize IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 → 127.0.0.1)
  const ipv4Mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  const normalized = ipv4Mapped ? ipv4Mapped[1] : host;

  if (
    normalized === 'localhost' ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized === '::' ||
    // IPv4 private/reserved
    normalized.startsWith('127.') ||
    normalized.startsWith('10.') ||
    normalized.startsWith('192.168.') ||
    normalized.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) ||
    /^0\./.test(normalized) ||
    // IPv6 loopback (all zero-padded variants)
    /^(0{0,4}:){0,7}0{0,3}1$/.test(normalized) ||
    /^(0{0,4}:){0,7}0{0,4}$/.test(normalized) ||
    // IPv6 Unique Local Address (fc00::/7)
    /^f[cd][0-9a-f]{2}:/.test(normalized) ||
    // IPv6 Link-Local (fe80::/10)
    /^fe[89ab][0-9a-f]:/.test(normalized) ||
    // Reserved hostnames
    normalized.endsWith('.internal') ||
    normalized.endsWith('.local')
  ) {
    return false;
  }

  return true;
}

