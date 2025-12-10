/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { getErrorMessage, isNodeError } from './errors.js';
import { URL } from 'node:url';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

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

const WELL_KNOWN_PRIVATE_HOSTNAMES = new Set([
  'localhost',
  'ip6-localhost',
  'ip6loopback',
  'loopback',
  '0.0.0.0',
]);

const IPV4_PRIVATE_RANGES = [
  ['10.0.0.0', '10.255.255.255'],
  ['127.0.0.0', '127.255.255.255'],
  ['169.254.0.0', '169.254.255.255'],
  ['172.16.0.0', '172.31.255.255'],
  ['192.168.0.0', '192.168.255.255'],
];

function ipv4ToNumber(address: string): number {
  const parts = address.split('.');
  if (parts.length !== 4) {
    return NaN;
  }
  return parts.reduce((acc, part) => {
    const num = Number(part);
    if (Number.isNaN(num)) {
      return NaN;
    }
    return (acc << 8) + num;
  }, 0);
}

const IPV4_PRIVATE_NUMERIC_RANGES = IPV4_PRIVATE_RANGES.map(([start, end]) => [
  ipv4ToNumber(start),
  ipv4ToNumber(end),
]);

function isIPv4Private(address: string): boolean {
  const numeric = ipv4ToNumber(address);
  if (Number.isNaN(numeric)) {
    return false;
  }
  return IPV4_PRIVATE_NUMERIC_RANGES.some(
    ([start, end]) => numeric >= start && numeric <= end,
  );
}

function isIPv6Private(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::1') {
    return true;
  }

  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.split(':').pop();
    if (mapped && isIPv4Private(mapped)) {
      return true;
    }
  }

  if (
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true;
  }

  return false;
}

function isPrivateAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) {
    return isIPv4Private(address);
  }
  if (version === 6) {
    return isIPv6Private(address);
  }
  return false;
}

async function resolveHostAddresses(hostname: string): Promise<string[]> {
  if (net.isIP(hostname)) {
    return [hostname];
  }

  try {
    const records = (await lookup(hostname, {
      all: true,
      verbatim: true,
    })) as LookupAddress[];
    return records.map((record) => record.address);
  } catch {
    return [];
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, '');
}

export async function isPrivateIp(url: string): Promise<boolean> {
  if (!url) {
    return false;
  }

  let hostname: string;
  try {
    hostname = normalizeHostname(new URL(url).hostname);
  } catch (_error) {
    return false;
  }

  if (!hostname) {
    return false;
  }

  if (WELL_KNOWN_PRIVATE_HOSTNAMES.has(hostname)) {
    return true;
  }

  if (isPrivateAddress(hostname)) {
    return true;
  }

  const resolvedAddresses = await resolveHostAddresses(hostname);
  return resolvedAddresses.some((address) => isPrivateAddress(address));
}

export async function fetchWithTimeout(
  url: string,
  timeout: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
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
  setGlobalDispatcher(new ProxyAgent(proxy));
}
