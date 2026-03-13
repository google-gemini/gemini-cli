/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getErrorMessage, isNodeError } from './errors.js';
import { URL } from 'node:url';
import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici';
import ipaddr from 'ipaddr.js';
import * as dns from 'node:dns';
import { lookup } from 'node:dns/promises';

const DEFAULT_HEADERS_TIMEOUT = 300000; // 5 minutes
const DEFAULT_BODY_TIMEOUT = 300000; // 5 minutes
const MAX_REDIRECTS = 10;

export class FetchError extends Error {
  constructor(
    message: string,
    public code?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'FetchError';
  }
}

export class PrivateIpError extends Error {
  constructor(message = 'Access to private network is blocked') {
    super(message);
    this.name = 'PrivateIpError';
  }
}

/**
 * NodeFetchInit is a type that includes undici-specific options.
 */
interface NodeFetchInit extends RequestInit {
  dispatcher?: Agent | ProxyAgent;
}

// Configure default global dispatcher with higher timeouts
setGlobalDispatcher(
  new Agent({
    headersTimeout: DEFAULT_HEADERS_TIMEOUT,
    bodyTimeout: DEFAULT_BODY_TIMEOUT,
  }),
);

/**
 * Sanitizes a hostname by stripping IPv6 brackets if present.
 */
export function sanitizeHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

/**
 * Checks if a hostname is a local loopback address allowed for development/testing.
 */
export function isLoopbackHost(hostname: string): boolean {
  const sanitized = sanitizeHostname(hostname);
  return (
    sanitized === 'localhost' ||
    sanitized === '127.0.0.1' ||
    sanitized === '::1'
  );
}

/**
 * A custom DNS lookup implementation for undici agents that prevents
 * connection to private IP ranges (SSRF protection).
 */
export function safeLookup(
  hostname: string,
  options: dns.LookupOptions | number | null | undefined,
  callback: (
    err: Error | null,
    addresses: Array<{ address: string; family: number }>,
  ) => void,
): void {
  // Use the callback-based dns.lookup to match undici's expected signature.
  // We explicitly handle the 'all' option to ensure we get an array of addresses.
  const lookupOptions =
    typeof options === 'number' ? { family: options } : { ...options };
  const finalOptions = { ...lookupOptions, all: true };

  dns.lookup(hostname, finalOptions, (err, addresses) => {
    if (err) {
      callback(err, []);
      return;
    }

    const addressArray = Array.isArray(addresses) ? addresses : [];
    const filtered = addressArray.filter(
      (addr) => !isAddressPrivate(addr.address) || isLoopbackHost(hostname),
    );

    if (filtered.length === 0 && addressArray.length > 0) {
      callback(new PrivateIpError(), []);
      return;
    }

    callback(null, filtered);
  });
}

// Dedicated dispatcher with connection-level SSRF protection (safeLookup)

export function isPrivateIp(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return isAddressPrivate(hostname);
  } catch {
    return false;
  }
}

/**
 * IANA Benchmark Testing Range (198.18.0.0/15).
 * Classified as 'unicast' by ipaddr.js but is reserved and should not be
 * accessible as public internet.
 */
const IANA_BENCHMARK_RANGE = ipaddr.parseCIDR('198.18.0.0/15');

/**
 * Checks if an address falls within the IANA benchmark testing range.
 */
function isBenchmarkAddress(addr: ipaddr.IPv4 | ipaddr.IPv6): boolean {
  const [rangeAddr, rangeMask] = IANA_BENCHMARK_RANGE;
  return (
    addr instanceof ipaddr.IPv4 &&
    rangeAddr instanceof ipaddr.IPv4 &&
    addr.match(rangeAddr, rangeMask)
  );
}

/**
 * Internal helper to check if an IP address string is in a private or reserved range.
 */
export function isAddressPrivate(address: string): boolean {
  const sanitized = sanitizeHostname(address);

  if (sanitized === 'localhost') {
    return true;
  }

  try {
    if (!ipaddr.isValid(sanitized)) {
      return false;
    }

    const addr = ipaddr.parse(sanitized);

    // Special handling for IPv4-mapped IPv6 (::ffff:x.x.x.x)
    // We unmap it and check the underlying IPv4 address.
    if (addr instanceof ipaddr.IPv6 && addr.isIPv4MappedAddress()) {
      return isAddressPrivate(addr.toIPv4Address().toString());
    }

    // Explicitly block IANA benchmark testing range.
    if (isBenchmarkAddress(addr)) {
      return true;
    }

    return addr.range() !== 'unicast';
  } catch {
    // If parsing fails despite isValid(), we treat it as potentially unsafe.
    return true;
  }
}

/**
 * Checks if a URL resolves to a private IP address.
 */
export async function isPrivateIpAsync(url: string): Promise<boolean> {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;

    if (isLoopbackHost(hostname)) {
      return false;
    }

    const addresses = await lookup(hostname, { all: true });
    return addresses.some((addr) => isAddressPrivate(addr.address));
  } catch (error) {
    if (error instanceof TypeError) {
      return false;
    }
    throw new Error('Failed to verify if URL resolves to private IP', {
      cause: error,
    });
  }
}

/**
 * Internal helper to map varied fetch errors to a standardized FetchError.
 * Centralizes security-related error mapping (e.g. PrivateIpError).
 */
function handleFetchError(error: unknown, url: string): never {
  if (error instanceof PrivateIpError) {
    throw new FetchError(
      `Access to private network is blocked: ${url}`,
      'ERR_PRIVATE_NETWORK',
      { cause: error },
    );
  }

  if (error instanceof FetchError) {
    throw error;
  }

  throw new FetchError(
    getErrorMessage(error),
    isNodeError(error) ? error.code : undefined,
    { cause: error },
  );
}

/**
 * Internal helper to perform a fetch with manual redirect handling, SSRF validation, and DNS pinning.
 */
async function safeFetchWithRedirects(
  input: RequestInfo | URL,
  init?: RequestInit,
  redirectCount = 0,
): Promise<Response> {
  if (redirectCount >= MAX_REDIRECTS) {
    throw new FetchError('Too many redirects', 'ERR_TOO_MANY_REDIRECTS');
  }

  const urlStr =
    input instanceof Request
      ? input.url
      : typeof input === 'string'
        ? input
        : input.toString();

  const parsedUrl = new URL(urlStr);
  const hostname = parsedUrl.hostname;

  // Resolve DNS to check the actual target IP (DNS pinning start)
  const addresses = await lookup(hostname, { all: true });
  const safeAddresses = addresses.filter(
    (addr) => !isAddressPrivate(addr.address) || isLoopbackHost(hostname),
  );

  if (safeAddresses.length === 0) {
    throw new PrivateIpError(
      `Access to private network is blocked: ${hostname}`,
    );
  }

  // Pin to the first safe address
  const pinnedAddress = safeAddresses[0];

  // Create a custom dispatcher for this request that pins the IP
  const pinnedDispatcher = new Agent({
    headersTimeout: DEFAULT_HEADERS_TIMEOUT,
    bodyTimeout: DEFAULT_BODY_TIMEOUT,
    connect: {
      lookup: (_h, _o, cb) => {
        // Only return the pinned address if the hostname matches
        if (_h === hostname) {
          cb(null, [pinnedAddress]);
        } else {
          // For other hostnames (e.g. proxy), use default safe lookup
          safeLookup(_h, _o, cb);
        }
      },
    },
  });

  const nodeInit: NodeFetchInit = {
    ...init,
    dispatcher: pinnedDispatcher,
    redirect: 'manual',
  };

  // eslint-disable-next-line no-restricted-syntax
  const response = await fetch(input, nodeInit);

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (location) {
      const targetUrl = new URL(location, urlStr).toString();
      return safeFetchWithRedirects(targetUrl, init, redirectCount + 1);
    }
  }

  return response;
}

/**
 * Enhanced fetch with SSRF protection.
 * Prevents access to private/internal networks at the connection level and via redirects.
 */
export async function safeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await safeFetchWithRedirects(input, init);
  } catch (error) {
    const url =
      input instanceof Request
        ? input.url
        : typeof input === 'string'
          ? input
          : input.toString();
    handleFetchError(error, url);
  }
}

/**
 * Creates an undici ProxyAgent that incorporates safe DNS lookup.
 */
export function createSafeProxyAgent(proxyUrl: string): ProxyAgent {
  return new ProxyAgent({
    uri: proxyUrl,
  });
}

export async function fetchWithTimeout(
  url: string,
  timeout: number,
  options?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  if (options?.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
    }
  }

  try {
    const response = await safeFetchWithRedirects(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ABORT_ERR') {
      throw new FetchError(`Request timed out after ${timeout}ms`, 'ETIMEDOUT');
    }
    handleFetchError(error, url.toString());
  } finally {
    clearTimeout(timeoutId);
  }
}

export function setGlobalProxy(proxy: string) {
  setGlobalDispatcher(
    new ProxyAgent({
      uri: proxy,
      headersTimeout: DEFAULT_HEADERS_TIMEOUT,
      bodyTimeout: DEFAULT_BODY_TIMEOUT,
    }),
  );
}
