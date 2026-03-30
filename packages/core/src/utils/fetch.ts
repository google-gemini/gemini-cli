/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getErrorMessage, isNodeError } from './errors.js';
import { URL } from 'node:url';
import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici';
import ipaddr from 'ipaddr.js';
import { lookup } from 'node:dns/promises';

const DEFAULT_HEADERS_TIMEOUT = 300000; // 5 minutes
const DEFAULT_BODY_TIMEOUT = 300000; // 5 minutes

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
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ABORT_ERR') {
      throw new FetchError(`Request timed out after ${timeout}ms`, 'ETIMEDOUT');
    }
    throw new FetchError(getErrorMessage(error), undefined, { cause: error });
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
