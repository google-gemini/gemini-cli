/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DomainRule, DomainCheckResult, NetworkProxyConfig, DomainFilterAction } from './types.js';

/**
 * Checks whether a domain pattern matches a given hostname.
 *
 * Supported patterns:
 *   - Exact match: "example.com" matches "example.com"
 *   - Wildcard prefix: "*.example.com" matches "sub.example.com", "a.b.example.com"
 *   - Full wildcard: "*" matches everything
 *
 * Matching is case-insensitive.
 */
export function matchesDomainPattern(pattern: string, hostname: string): boolean {
  const normalizedPattern = pattern.toLowerCase().trim();
  const normalizedHost = hostname.toLowerCase().trim();

  if (normalizedPattern === '*') {
    return true;
  }

  // Wildcard subdomain match: *.example.com
  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(2); // "example.com"
    // Must match the suffix exactly, or be a subdomain of it
    return normalizedHost === suffix || normalizedHost.endsWith('.' + suffix);
  }

  return normalizedHost === normalizedPattern;
}

/**
 * Evaluates a hostname against an ordered list of domain rules.
 * Returns the action from the first matching rule, or the default action.
 */
export function checkDomain(
  hostname: string,
  rules: DomainRule[],
  defaultAction: DomainFilterAction,
): DomainCheckResult {
  for (const rule of rules) {
    if (matchesDomainPattern(rule.pattern, hostname)) {
      return {
        domain: hostname,
        action: rule.action,
        matchedRule: rule,
      };
    }
  }

  return {
    domain: hostname,
    action: defaultAction,
  };
}

/**
 * Convenience function that checks a domain using a full NetworkProxyConfig.
 */
export function checkDomainWithConfig(
  hostname: string,
  config: NetworkProxyConfig,
): DomainCheckResult {
  return checkDomain(hostname, config.rules, config.defaultAction);
}

/**
 * Extracts the hostname from an HTTP request URL or CONNECT target.
 * Handles both "host:port" format (from CONNECT) and full URLs,
 * including IPv6 address literals like [::1]:8080.
 */
export function extractHostname(target: string): string {
  try {
    // Prepend a dummy protocol for bare host:port strings so the URL
    // parser can handle them, including IPv6 bracket notation.
    const urlString = target.includes('://') ? target : `dummy://${target}`;
    return new URL(urlString).hostname;
  } catch {
    return target;
  }
}

/**
 * Extracts the port from an HTTP request URL or CONNECT target.
 * Returns the default port for the protocol if not specified.
 * Handles IPv6 address literals like [::1]:8080.
 */
export function extractPort(target: string, defaultPort: number = 80): number {
  try {
    const hasProtocol = target.includes('://');
    const urlString = hasProtocol ? target : `dummy://${target}`;
    const url = new URL(urlString);
    if (url.port) {
      return parseInt(url.port, 10);
    }
    if (hasProtocol) {
      return url.protocol === 'https:' ? 443 : 80;
    }
    return defaultPort;
  } catch {
    return defaultPort;
  }
}
