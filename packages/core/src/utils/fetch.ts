/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getErrorMessage, isAbortError } from './errors.js';
import { URL } from 'node:url';
import * as net from 'node:net';
import * as undici from 'undici';
import ipaddr from 'ipaddr.js';
import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';

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

let defaultHeadersTimeout = 60000; // 60 seconds
const defaultBodyTimeout = 300000; // 5 minutes
let currentProxy: string | undefined = undefined;

function getBuildConnector():
  | ((options?: object) => undici.buildConnector.connector)
  | undefined {
  try {
    const fn = (
      undici as {
        buildConnector?: (options?: object) => undici.buildConnector.connector;
      }
    ).buildConnector;
    return typeof fn === 'function' ? fn : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Custom DNS lookup function for undici.buildConnector that resolves all IP addresses,
 * validates every address against private/reserved ranges, and passes back validated addresses
 * to preserve dual-stack fallback (Happy Eyeballs, RFC 8305) without risking DNS rebinding.
 */
export function safeLookup(
  hostname: string,
  options: { all?: boolean; family?: number },
  callback: (
    err: Error | null,
    address: string | LookupAddress[] | net.IPVersion,
    family?: number,
  ) => void,
): void {
  const sanitized = sanitizeHostname(hostname);

  // Block internal TLDs / loopback domain names
  if (
    sanitized === 'localhost' ||
    sanitized.endsWith('.localhost') ||
    sanitized.endsWith('.local') ||
    sanitized.endsWith('.internal')
  ) {
    callback(
      new PrivateIpError(`Access to internal host ${sanitized} is blocked`),
      '',
    );
    return;
  }

  // Direct IP literal check
  if (net.isIP(sanitized)) {
    if (isAddressPrivate(sanitized)) {
      callback(
        new PrivateIpError(`Access to private IP ${sanitized} is blocked`),
        '',
      );
      return;
    }
    if (options?.all) {
      callback(null, [{ address: sanitized, family: net.isIP(sanitized) }]);
    } else {
      callback(null, sanitized, net.isIP(sanitized));
    }
    return;
  }

  // Resolve all IP addresses via dns.lookup
  lookup(sanitized, { all: true })
    .then((addresses) => {
      if (!addresses || addresses.length === 0) {
        callback(new Error(`getaddrinfo ENOTFOUND ${sanitized}`), '');
        return;
      }

      // Evaluate ALL resolved addresses against private ranges
      for (const addr of addresses) {
        if (isAddressPrivate(addr.address)) {
          callback(
            new PrivateIpError(
              `Access to private IP ${addr.address} (resolved from ${sanitized}) is blocked`,
            ),
            '',
          );
          return;
        }
      }

      // Pass back safe addresses to undici connector
      if (options?.all) {
        callback(null, addresses);
      } else {
        const family = options?.family;
        const match = family
          ? addresses.find((a) => a.family === family) || addresses[0]
          : addresses[0];
        callback(null, match.address, match.family);
      }
    })
    .catch((err: unknown) => {
      callback(err instanceof Error ? err : new Error(String(err)), '');
    });
}

/**
 * Creates an undici connector that validates destination IP addresses and configures
 * a safe DNS lookup function to prevent DNS rebinding (TOCTOU) attacks while preserving
 * dual-stack resilience (Happy Eyeballs).
 */
export function createSafeConnector(
  connectorOpts?: undici.buildConnector.BuildOptions,
  customDefaultConnector?: undici.buildConnector.connector,
): undici.buildConnector.connector {
  const buildConnectorFn = getBuildConnector();

  const safeConnectorOpts = {
    ...connectorOpts,
    lookup: safeLookup,
  };

  const defaultConnector =
    customDefaultConnector ??
    (buildConnectorFn ? buildConnectorFn(safeConnectorOpts) : undefined);

  return function safeConnect(
    opts: undici.buildConnector.Options,
    callback: undici.buildConnector.Callback,
  ) {
    if (!defaultConnector) {
      callback(new Error('Connector is unavailable'), null);
      return;
    }

    const rawHostname = opts.hostname;
    const sanitized = sanitizeHostname(rawHostname);

    // Direct IP address literal check or internal TLD check
    if (
      sanitized === 'localhost' ||
      sanitized.endsWith('.localhost') ||
      sanitized.endsWith('.local') ||
      sanitized.endsWith('.internal')
    ) {
      callback(
        new PrivateIpError(`Access to internal host ${sanitized} is blocked`),
        null,
      );
      return;
    }

    if (net.isIP(sanitized) && isAddressPrivate(sanitized)) {
      callback(
        new PrivateIpError(`Access to private IP ${sanitized} is blocked`),
        null,
      );
      return;
    }

    defaultConnector(opts, callback);
  };
}

export function createSafeAgent(options?: {
  headersTimeout?: number;
  bodyTimeout?: number;
}): undici.Agent {
  const buildConnectorFn = getBuildConnector();
  if (!buildConnectorFn) {
    throw new Error(
      'Security initialization failed: undici.buildConnector is not available.',
    );
  }

  const connect = createSafeConnector();
  return new undici.Agent({
    headersTimeout: options?.headersTimeout ?? defaultHeadersTimeout,
    bodyTimeout: options?.bodyTimeout ?? defaultBodyTimeout,
    connect,
  });
}

let defaultSafeAgent = createSafeAgent();

// Configure default global dispatcher with higher timeouts
undici.setGlobalDispatcher(
  new undici.Agent({
    headersTimeout: defaultHeadersTimeout,
    bodyTimeout: defaultBodyTimeout,
  }),
);

export function updateGlobalFetchTimeouts(timeoutMs: number) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError(
      `Invalid timeout value: ${timeoutMs}. Must be a positive finite number.`,
    );
  }
  defaultHeadersTimeout = timeoutMs;
  defaultSafeAgent = createSafeAgent({
    headersTimeout: defaultHeadersTimeout,
    bodyTimeout: defaultBodyTimeout,
  });
  // We keep body timeout high for LLM streaming responses
  if (currentProxy) {
    setGlobalProxy(currentProxy);
  } else {
    undici.setGlobalDispatcher(
      new undici.Agent({
        headersTimeout: defaultHeadersTimeout,
        bodyTimeout: defaultBodyTimeout,
      }),
    );
  }
}

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

  if (
    sanitized === 'localhost' ||
    sanitized.endsWith('.localhost') ||
    sanitized.endsWith('.local') ||
    sanitized.endsWith('.internal')
  ) {
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
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    if (error instanceof TypeError) {
      return false;
    }
    throw error;
  }

  const hostname = sanitizeHostname(parsedUrl.hostname);

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return true;
  }

  if (net.isIP(hostname)) {
    return isAddressPrivate(hostname);
  }

  try {
    const addresses = await lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return true;
    }
    return addresses.some((addr) => isAddressPrivate(addr.address));
  } catch (error) {
    throw new Error('Failed to verify if URL resolves to private IP', {
      cause: error,
    });
  }
}

/**
 * Checks if a URL targets or resolves to a private, loopback, or reserved network.
 * Fails closed on resolution errors or timeouts.
 *
 * Checks performed:
 * - RFC 1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 * - Loopback addresses (127.0.0.0/8, ::1)
 * - Cloud Metadata and link-local addresses (169.254.0.0/16, fe80::/10)
 * - Carrier-Grade NAT (100.64.0.0/10)
 * - IANA benchmark testing range (198.18.0.0/15)
 * - IPv6 unique local addresses (fc00::/7) and IPv4-mapped IPv6 (::ffff:x.x.x.x)
 * - Internal top-level domains (.localhost, .local, .internal)
 * - Multi-IP resolution: rejects if ANY resolved address is private or reserved
 *
 * @param url - The URL string to inspect
 * @returns Promise resolving to `true` if private/reserved or resolution failed, `false` if safe public IP
 */
export async function isPrivateIp(url: string): Promise<boolean> {
  try {
    return await isPrivateIpAsync(url);
  } catch {
    return true; // Fail closed
  }
}

/**
 * Validates a URL destination to ensure it safely targets the public internet and
 * does not target private, local, internal, or reserved networks (SSRF defense).
 *
 * Returns `false` if the destination is private, reserved, invalid, or cannot be
 * resolved (fail-closed security posture).
 *
 * @example
 * ```ts
 * import { validateUrlDestination } from '@google/gemini-cli-core';
 *
 * if (!(await validateUrlDestination(userSuppliedUrl))) {
 *   throw new Error('Access to private or blocked host is not allowed.');
 * }
 * ```
 *
 * @param url - The URL string to validate
 * @returns Promise resolving to `true` if safe for outbound fetching, `false` otherwise
 */
export async function validateUrlDestination(url: string): Promise<boolean> {
  try {
    const isPrivate = await isPrivateIp(url);
    return !isPrivate;
  } catch {
    return false; // Fail closed
  }
}

/**
 * Creates an undici EnvHttpProxyAgent that incorporates safe DNS lookup.
 */
export function createSafeProxyAgent(
  proxyUrl: string,
): undici.EnvHttpProxyAgent {
  const trimmedProxy = proxyUrl.trim();
  const noProxy = (
    process.env['NO_PROXY'] ??
    process.env['no_proxy'] ??
    ''
  )?.trim();
  return new undici.EnvHttpProxyAgent({
    httpProxy: trimmedProxy,
    httpsProxy: trimmedProxy,
    noProxy,
    headersTimeout: defaultHeadersTimeout,
    bodyTimeout: defaultBodyTimeout,
  });
}

export async function fetchWithTimeout(
  url: string,
  timeout: number,
  options?: RequestInit,
): Promise<Response> {
  if (await isPrivateIp(url)) {
    throw new PrivateIpError(
      `Access to blocked or private host ${url} is not allowed.`,
    );
  }

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
    const fetchOptions: RequestInit & { dispatcher?: undici.Dispatcher } = {
      ...options,
      signal: controller.signal,
    };

    if (!fetchOptions.dispatcher) {
      fetchOptions.dispatcher = currentProxy
        ? createSafeProxyAgent(currentProxy)
        : defaultSafeAgent;
    }

    const response = await fetch(url, fetchOptions);
    return response;
  } catch (error) {
    if (isAbortError(error)) {
      // If the caller's own signal was already aborted, this is a user-initiated
      // cancellation (e.g. Ctrl+C), not an internal timeout. Re-throw as a plain
      // AbortError so the retry layer does NOT treat it as a retryable ETIMEDOUT.
      if (options?.signal?.aborted) {
        // Rethrow the original abort reason or the caught error to preserve
        // the stack trace and any custom abort reason (e.g. from Ctrl+C).
        throw options.signal.reason ?? error;
      }
      throw new FetchError(`Request timed out after ${timeout}ms`, 'ETIMEDOUT');
    }
    if (error instanceof PrivateIpError) {
      throw error;
    }
    if (error && typeof error === 'object' && 'cause' in error) {
      if (error.cause instanceof PrivateIpError) {
        throw error.cause;
      }
    }
    throw new FetchError(getErrorMessage(error), undefined, { cause: error });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function setGlobalProxy(proxy: string) {
  const trimmedProxy = proxy.trim();
  currentProxy = trimmedProxy;
  const noProxy = (
    process.env['NO_PROXY'] ??
    process.env['no_proxy'] ??
    ''
  )?.trim();
  undici.setGlobalDispatcher(
    new undici.EnvHttpProxyAgent({
      httpProxy: trimmedProxy,
      httpsProxy: trimmedProxy,
      noProxy,
      headersTimeout: defaultHeadersTimeout,
      bodyTimeout: defaultBodyTimeout,
    }),
  );
}
