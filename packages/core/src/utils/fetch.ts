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

const DEFAULT_HEADERS_TIMEOUT = 60000; // 60 seconds
const DEFAULT_BODY_TIMEOUT = 300000; // 5 minutes
let defaultHeadersTimeout = DEFAULT_HEADERS_TIMEOUT;
let defaultBodyTimeout = DEFAULT_BODY_TIMEOUT;
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

export function updateGlobalFetchTimeouts(
  timeoutMs: number,
  bodyTimeoutMs?: number,
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError(
      `Invalid timeout value: ${timeoutMs}. Must be a positive finite number.`,
    );
  }
  if (
    bodyTimeoutMs !== undefined &&
    (!Number.isFinite(bodyTimeoutMs) || bodyTimeoutMs <= 0)
  ) {
    throw new RangeError(
      `Invalid body timeout value: ${bodyTimeoutMs}. Must be a positive finite number.`,
    );
  }
  defaultHeadersTimeout = timeoutMs;
  // We keep body timeout at least at the 5-minute default for LLM streaming responses,
  // while scaling it up when a larger request timeout is configured.
  defaultBodyTimeout =
    bodyTimeoutMs ?? Math.max(DEFAULT_BODY_TIMEOUT, timeoutMs);
  defaultSafeAgent = createSafeAgent({
    headersTimeout: defaultHeadersTimeout,
    bodyTimeout: defaultBodyTimeout,
  });
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
 * Checks if a hostname or IP address belongs to an enterprise private network range
 * (RFC 1918, RFC 6598 Carrier-Grade NAT, RFC 4193 IPv6 Unique Local, or .internal/.local domains)
 * while excluding loopback, link-local, multicast, broadcast, unspecified, reserved, and benchmark ranges.
 */
export function isEnterprisePrivateAddress(addressOrHost: string): boolean {
  const normalized = sanitizeHostname(addressOrHost).toLowerCase();

  if (normalized.endsWith('.internal') || normalized.endsWith('.local')) {
    return true;
  }

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return false;
  }

  try {
    if (!ipaddr.isValid(normalized)) {
      return false;
    }

    let addr: ipaddr.IPv4 | ipaddr.IPv6 = ipaddr.parse(normalized);

    if (addr instanceof ipaddr.IPv6 && addr.isIPv4MappedAddress()) {
      addr = addr.toIPv4Address();
    }

    if (isBenchmarkAddress(addr)) {
      return false;
    }

    const range = addr.range();
    return (
      range === 'private' ||
      range === 'carrierGradeNat' ||
      range === 'uniqueLocal'
    );
  } catch {
    return false;
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
 * Creates a connector for use with EnvHttpProxyAgent that validates direct
 * (no_proxy) target connections with the safe DNS lookup, while allowing
 * connections to the explicitly configured proxy host itself.
 *
 * EnvHttpProxyAgent passes the same `connect` function to both the direct
 * agent (used for no_proxy targets) and the proxy agents (used to reach the
 * proxy). The proxy resolves proxied targets itself, so on the proxy branch
 * the connector only ever sees the proxy hostname — blocking private proxy
 * hosts would break legitimate corporate proxies. The connector therefore
 * lets the configured proxy host through with the default connector and
 * validates every other hostname with the safe connector. Proxied TARGETS
 * are validated separately (see `safeFetchFollowingRedirects`) before the proxy is asked
 * (see `safeFetchFollowingRedirects`).
 */
export function createProxyAwareSafeConnector(
  proxyUrl: string,
): undici.buildConnector.connector {
  const buildConnectorFn = getBuildConnector();
  if (!buildConnectorFn) {
    throw new Error(
      'Security initialization failed: undici.buildConnector is not available.',
    );
  }
  let proxyHostname = '';
  try {
    proxyHostname = sanitizeHostname(new URL(proxyUrl).hostname);
  } catch {
    // Unparseable proxy URL: no host is exempted (fail closed).
    proxyHostname = '';
  }
  const defaultConnector = buildConnectorFn({});
  const safeConnect = createSafeConnector();
  return function proxyAwareSafeConnect(
    opts: undici.buildConnector.Options,
    callback: undici.buildConnector.Callback,
  ) {
    if (
      proxyHostname &&
      sanitizeHostname(opts.hostname) === proxyHostname
    ) {
      // Connecting to the explicitly configured proxy itself.
      defaultConnector(opts, callback);
      return;
    }
    safeConnect(opts, callback);
  };
}

/**
 * Creates an undici EnvHttpProxyAgent whose direct (no_proxy) connections
 * use the safe DNS lookup (see `createProxyAwareSafeConnector`). Note the
 * proxy itself resolves proxied targets, so this does NOT validate proxied
 * target addresses — callers fetching URLs influenced by untrusted content
 * must use `safeFetchFollowingRedirects`, which validates every hop before
 * the proxy is asked.
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
    connect: createProxyAwareSafeConnector(trimmedProxy),
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
  currentProxy = trimmedProxy || undefined;
  if (!currentProxy) {
    undici.setGlobalDispatcher(
      new undici.Agent({
        headersTimeout: defaultHeadersTimeout,
        bodyTimeout: defaultBodyTimeout,
      }),
    );
    return;
  }
  // Route the global dispatcher through the proxy-aware safe connector so
  // direct (no_proxy) targets are validated while the configured proxy host
  // itself stays reachable.
  undici.setGlobalDispatcher(createSafeProxyAgent(currentProxy));
}

const MAX_SAFE_REDIRECTS = 5;

/**
 * Throws PrivateIpError if the url targets a private, loopback, link local, or
 * otherwise non public address. It checks both the literal hostname and the
 * address the hostname resolves to, so it stops IP literals such as
 * 169.254.169.254 and hostnames such as metadata.google.internal that resolve
 * to a private address.
 */
export async function assertUrlIsPublic(url: string): Promise<void> {
  if (await isPrivateIp(url)) {
    throw new PrivateIpError(
      `Access to private or internal address ${url} is blocked`,
    );
  }
}

// Credential carrying headers that must not be forwarded to a different origin
// during a redirect.
const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'cookie2',
  'proxy-authorization',
];

/**
 * Computes the next url and request options for a redirect hop. It rejects any
 * redirect target that is not http or https, strips credential carrying headers
 * when the redirect crosses to a different origin, and downgrades the method to
 * GET while removing the body for 303 responses and for non GET or HEAD 301 and
 * 302 responses, following RFC 9110.
 */
export function applyRedirect(
  currentUrl: string,
  status: number,
  location: string,
  options: RequestInit,
): { nextUrl: string; nextOptions: RequestInit } {
  const nextUrl = new URL(location, currentUrl);
  if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
    throw new FetchError(
      `Unsupported redirect protocol ${nextUrl.protocol}`,
      'EUNSUPPORTEDPROTOCOL',
    );
  }

  let nextOptions: RequestInit = { ...options };

  const currentUrlObj = new URL(currentUrl);
  const isCrossOrigin =
    currentUrlObj.protocol !== nextUrl.protocol ||
    currentUrlObj.host !== nextUrl.host;
  if (isCrossOrigin && nextOptions.headers) {
    const headers = new Headers(nextOptions.headers);
    for (const name of SENSITIVE_HEADERS) {
      headers.delete(name);
    }
    nextOptions = { ...nextOptions, headers };
  }

  const method = (nextOptions.method ?? 'GET').toUpperCase();
  if (
    status === 303 ||
    ((status === 301 || status === 302) &&
      method !== 'GET' &&
      method !== 'HEAD')
  ) {
    const headers = new Headers(nextOptions.headers ?? {});
    headers.delete('content-type');
    headers.delete('content-length');
    nextOptions = {
      ...nextOptions,
      method: 'GET',
      body: undefined,
      headers,
    };
  }

  return { nextUrl: nextUrl.toString(), nextOptions };
}

/**
 * Fetches a url while enforcing the SSRF guard on the initial request and on
 * every redirect hop. Redirects are followed manually so the resolved target
 * of each hop is validated before the connection is made. Use this for any
 * fetch whose url can be influenced by untrusted content.
 */
export async function safeFetchFollowingRedirects(
  url: string,
  timeout: number,
  options?: RequestInit,
): Promise<Response> {
  let currentUrl = url;
  let currentOptions: RequestInit = { ...options };

  for (let hop = 0; hop <= MAX_SAFE_REDIRECTS; hop++) {
    const response = await fetchWithTimeout(currentUrl, timeout, {
      ...currentOptions,
      redirect: 'manual',
    });

    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get('location');
    if (!location) {
      return response;
    }

    const next = applyRedirect(
      currentUrl,
      response.status,
      location,
      currentOptions,
    );
    currentUrl = next.nextUrl;
    currentOptions = next.nextOptions;
  }

  throw new FetchError(
    `Too many redirects while fetching ${url}`,
    'ETOOMANYREDIRECTS',
  );
}
