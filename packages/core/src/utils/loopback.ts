/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isIP } from 'node:net';

/**
 * Shared helpers for building loopback redirect hosts.
 */

export const DEFAULT_LOOPBACK_HOST = '127.0.0.1';

/**
 * Normalizes a loopback host value for binding. Removes IPv6 brackets and
 * defaults to the standard IPv4 loopback literal when none is provided.
 */
export function normalizeLoopbackHost(host?: string): string {
  if (!host) {
    return DEFAULT_LOOPBACK_HOST;
  }
  const trimmed = host.trim();
  if (trimmed.length === 0) {
    return DEFAULT_LOOPBACK_HOST;
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    return inner.length === 0 ? DEFAULT_LOOPBACK_HOST : inner;
  }
  return trimmed;
}

/**
 * Formats a loopback host for use in URIs. Adds brackets for IPv6 literals.
 */
export function formatLoopbackHostForUri(host: string): string {
  const normalized = normalizeLoopbackHost(host);
  return isIP(normalized) === 6 ? `[${normalized}]` : normalized;
}
