/**
 * SSRF protection for web-access.
 *
 * Every network fetch goes through validateRemoteUrl before the request is
 * sent, and redirects are re-validated on every hop. This prevents the model
 * from being turned into a proxy against internal (RFC1918 / loopback /
 * link-local / reserved) addresses.
 *
 * The address policy mirrors what pi-web-access ships, trimmed to our needs:
 * no config file, no proxy trust. Exemptions can only be granted via
 * allowRanges for unusual setups (for example the 198.18/15 space used by
 * TUN/fake-IP proxies).
 */

import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_REDIRECTS = 5;

/** AbortSignal support is available in Bun and Node >= 20; be defensive. */
export function combineSignals(
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): AbortSignal | undefined {
  if (timeoutMs === undefined) return signal;
  if (typeof AbortSignal.timeout !== "function") return signal;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (signal === undefined) return timeoutSignal;
  return typeof AbortSignal.any === "function"
    ? AbortSignal.any([signal, timeoutSignal])
    : signal;
}

export interface LookupAddress {
  address: string;
  family: number;
}

export interface SsrfOptions {
  /** CIDR or bare-IP ranges exempt from the private/reserved checks. */
  allowRanges?: string[];
  /** Optional explicit hostname allowlist (exact or subdomain matches). */
  allowedHosts?: string[];
  maxRedirects?: number;
  lookup?: (hostname: string) => Promise<LookupAddress[]>;
}

export interface SsrfFetchOptions extends SsrfOptions {
  timeoutMs?: number;
}

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

async function defaultLookup(hostname: string): Promise<LookupAddress[]> {
  return dnsLookup(hostname, { all: true });
}

function isFakeIpProxyAddress(address: string): boolean {
  const [a, b] = address.split(".").map((part) => parseInt(part, 10));
  return a === 198 && (b === 18 || b === 19);
}

function isBlockedIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => parseInt(part, 10));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 || // "this" network
    a === 10 || // RFC 1918
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) || // RFC 1918
    (a === 192 && b === 168) || // RFC 1918
    isFakeIpProxyAddress(address) || // TUN/fake-IP proxies
    a >= 224 // multicast + reserved
  );
}

function parseIPv6(address: string): number[] | null {
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    const ipv4 = address.slice(lastColon + 1);
    if (net.isIP(ipv4) !== 4) return null;
    const octets = ipv4.split(".").map((part) => parseInt(part, 10));
    address = `${address.slice(0, lastColon)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const pieces = address.split("::");
  if (pieces.length > 2) return null;

  const left = pieces[0] ? pieces[0].split(":") : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (pieces.length === 1 && missing !== 0) return null;
  if (pieces.length === 2 && missing < 0) return null;

  const groups = [...left, ...Array(missing).fill("0"), ...right].map(
    (part) => {
      if (!/^[0-9a-f]{1,4}$/i.test(part)) return -1;
      return parseInt(part, 16);
    },
  );
  return groups.length === 8 && groups.every((group) => group >= 0 && group <= 0xffff)
    ? groups
    : null;
}

function isBlockedIPv6(address: string): boolean {
  const groups = parseIPv6(address);
  if (!groups) return true;

  const first = groups[0];
  // all zeroes, or ::1
  if (groups.every((group) => group === 0)) return true;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true;
  // fc00::/7 unique local, fe80::/10 link-local
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;

  const isMappedIPv4 =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (isMappedIPv4) {
    const ipv4 = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
    return isBlockedIPv4(ipv4);
  }

  return false;
}

/** Parse "198.18.0.0/15" or "1.2.3.4" into a byte+prefix rule, or null. */
function parseRule(raw: string): { bytes: number[]; prefix: number } | null {
  if (!raw) return null;
  const slash = raw.lastIndexOf("/");
  const addrPart = slash >= 0 ? raw.slice(0, slash) : raw;
  const prefixPart = slash >= 0 ? raw.slice(slash + 1) : null;
  if (prefixPart !== null && !/^\d+$/.test(prefixPart)) return null;

  const version = net.isIP(addrPart);
  if (version === 4) {
    const bytes = addrPart.split(".").map((part) => parseInt(part, 10));
    if (bytes.length !== 4 || bytes.some((byte) => byte < 0 || byte > 255)) return null;
    const prefix = prefixPart === null ? 32 : parseInt(prefixPart, 10);
    if (!Number.isInteger(prefix) || prefix < 1 || prefix > 32) return null;
    return { bytes, prefix };
  }
  if (version === 6) {
    const groups = parseIPv6(addrPart);
    if (!groups) return null;
    const bytes: number[] = [];
    for (const group of groups) {
      bytes.push((group >> 8) & 0xff, group & 0xff);
    }
    const prefix = prefixPart === null ? 128 : parseInt(prefixPart, 10);
    if (!Number.isInteger(prefix) || prefix < 1 || prefix > 128) return null;
    return { bytes, prefix };
  }
  return null;
}

function ipInRule(address: string, rule: { bytes: number[]; prefix: number }): boolean {
  if (rule.bytes.length === 4) {
    const parts = address.split(".").map((part) => parseInt(part, 10));
    if (parts.length !== 4) return false;
    for (let i = 0; i < 4; i++) {
      if (rule.prefix <= i * 8) return true;
      const bits = Math.min(8, rule.prefix - i * 8);
      const mask = (0xff << (8 - bits)) & 0xff;
      if ((parts[i] & mask) !== (rule.bytes[i] & mask)) return false;
    }
    return true;
  }
  const groups = parseIPv6(address);
  if (!groups) return false;
  for (let i = 0; i < 8; i++) {
    if (rule.prefix <= i * 16) return true;
    const bits = Math.min(16, rule.prefix - i * 16);
    const mask = bits === 16 ? 0xffff : ((0xffff << (16 - bits)) & 0xffff);
    if ((groups[i] & mask) !== (rule.bytes[i] & mask)) return false;
  }
  return true;
}

function assertPublicAddress(address: string, allowRules: { bytes: number[]; prefix: number }[]): void {
  const normalized = normalizeHostname(address);
  const ipVersion = net.isIP(normalized);
  if (ipVersion === 0) {
    throw new SsrfError(`Resolved non-IP address: ${address}`);
  }
  if (allowRules.some((rule) => ipInRule(normalized, rule))) return;
  if (ipVersion === 4 && isBlockedIPv4(normalized)) {
    const hint = isFakeIpProxyAddress(normalized)
      ? ". This address sits in 198.18.0.0/15, commonly used by TUN/fake-IP proxies. If that matches your setup, pass allowRanges."
      : "";
    throw new SsrfError(`Blocked internal address: ${normalized}${hint}`);
  }
  if (ipVersion === 6 && isBlockedIPv6(normalized)) {
    throw new SsrfError(`Blocked internal address: ${normalized}`);
  }
}

function parseAllowRanges(input: string[] | undefined): { bytes: number[]; prefix: number }[] {
  const rules: { bytes: number[]; prefix: number }[] = [];
  for (const entry of input ?? []) {
    const rule = parseRule(entry.trim());
    if (!rule) {
      throw new SsrfError(`Invalid CIDR in allowRanges: "${entry}"`);
    }
    rules.push(rule);
  }
  return rules;
}

export async function validateRemoteUrl(
  rawUrl: string | URL,
  options: SsrfOptions = {},
): Promise<URL> {
  let url: URL;
  try {
    url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl);
  } catch {
    throw new SsrfError("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("Only HTTP and HTTPS URLs can be fetched");
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) throw new SsrfError("URL must include a hostname");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new SsrfError(`Blocked internal hostname: ${hostname}`);
  }

  if (options.allowedHosts && options.allowedHosts.length > 0) {
    const allowed = options.allowedHosts.some(
      (entry) => hostname === entry || hostname.endsWith(`.${entry}`),
    );
    if (!allowed) throw new SsrfError(`Hostname not allowed: ${hostname}`);
  }

  const allowRanges = parseAllowRanges(options.allowRanges);

  if (net.isIP(hostname)) {
    assertPublicAddress(hostname, allowRanges);
    return url;
  }

  const lookup = options.lookup ?? defaultLookup;
  let addresses: LookupAddress[];
  try {
    addresses = await lookup(hostname);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new SsrfError(`Failed to resolve ${hostname}: ${message}`);
  }
  if (addresses.length === 0) {
    throw new SsrfError(`Failed to resolve ${hostname}: no addresses returned`);
  }
  for (const { address } of addresses) {
    assertPublicAddress(address, allowRanges);
  }
  return url;
}

/**
 * Fetch a remote URL with redirect re-validation. Never follows a redirect
 * without first running it through validateRemoteUrl.
 */
export async function fetchRemoteUrl(
  rawUrl: string | URL,
  init: RequestInit = {},
  options: SsrfFetchOptions = {},
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const baseSignal = combineSignals(init.signal, options.timeoutMs);
  let current = await validateRemoteUrl(rawUrl, options);
  let requestInit = baseSignal ? { ...init, signal: baseSignal } : init;

  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const response = await fetch(current, { ...requestInit, redirect: "manual" });
    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    if (redirects === maxRedirects) {
      throw new SsrfError(`Too many redirects fetching ${current.toString()}`);
    }

    current = await validateRemoteUrl(new URL(location, current), options);
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) &&
        requestInit.method?.toUpperCase() === "POST")
    ) {
      const { body: _body, ...nextInit } = requestInit;
      requestInit = { ...nextInit, method: "GET" };
    }
  }

  throw new SsrfError(`Too many redirects fetching ${current.toString()}`);
}

/**
 * Read the response body, but only up to maxBytes. Throws if the body runs
 * longer so giant downloads cannot blow up the context window.
 */
export async function readResponseBody(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declared = parseInt(contentLength, 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new SsrfError(`Response body too large (limit ${maxBytes} bytes)`);
    }
  }

  const reader = response.body?.getReader?.();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw new SsrfError(`Response body too large (limit ${maxBytes} bytes)`);
    }
    return new Uint8Array(buffer);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel?.();
        throw new SsrfError(`Response body too large (limit ${maxBytes} bytes)`);
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof SsrfError) throw err;
    await reader.cancel?.();
    throw err;
  }
  await reader.cancel?.();

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function decodeBody(body: Uint8Array, contentType: string | null): string {
  const charset = contentType?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}